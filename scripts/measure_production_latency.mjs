import dns from 'dns/promises';
import https from 'https';
import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf-8');
let supabaseUrl = '';
let supabaseAnonKey = '';

for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (trimmed.startsWith('VITE_SUPABASE_URL=')) {
    supabaseUrl = trimmed.split('=')[1].trim();
  } else if (trimmed.startsWith('VITE_SUPABASE_PUBLISHABLE_KEY=') || trimmed.startsWith('VITE_SUPABASE_ANON_KEY=')) {
    supabaseAnonKey = trimmed.split('=')[1].trim();
  }
}

const urlObj = new URL(supabaseUrl);
const hostname = urlObj.hostname;

// Custom agent with keep-alive for measuring connection reuse
const keepAliveAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 10,
  timeout: 10000,
});

// Custom agent without keep-alive for cold connection measurement
const coldAgent = new https.Agent({
  keepAlive: false,
});

async function measureDns(runs = 25) {
  const samples = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    await dns.lookup(hostname);
    const duration = performance.now() - start;
    samples.push(duration);
    await new Promise((r) => setTimeout(r, 20));
  }
  return samples;
}

function timedRequest(agent, path = '/rest/v1/shops?select=id,name&is_live=eq.true&limit=1') {
  return new Promise((resolve, reject) => {
    const timings = {
      dnsStart: 0,
      dnsEnd: 0,
      tcpStart: 0,
      tcpEnd: 0,
      tlsStart: 0,
      tlsEnd: 0,
      firstByte: 0,
      completed: 0,
      reusedSocket: false,
    };

    const startTime = performance.now();

    const req = https.request(
      {
        hostname: hostname,
        port: 443,
        path: path,
        method: 'GET',
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        agent: agent,
      },
      (res) => {
        res.once('readable', () => {
          timings.firstByte = performance.now();
        });
        res.on('data', () => {});
        res.on('end', () => {
          timings.completed = performance.now();
          const totalDuration = timings.completed - startTime;
          const ttfb = timings.firstByte > 0 ? timings.firstByte - startTime : totalDuration;
          const dnsTime = timings.dnsEnd - timings.dnsStart;
          const tcpTime = timings.tcpEnd - timings.tcpStart;
          const tlsTime = timings.tlsEnd - timings.tlsStart;

          resolve({
            statusCode: res.statusCode,
            totalDuration,
            ttfb,
            dnsTime: dnsTime > 0 ? dnsTime : 0,
            tcpTime: tcpTime > 0 ? tcpTime : 0,
            tlsTime: tlsTime > 0 ? tlsTime : 0,
            reusedSocket: timings.reusedSocket,
          });
        });
      }
    );

    req.on('socket', (socket) => {
      timings.tcpStart = performance.now();

      if (socket.connecting) {
        socket.once('lookup', () => {
          timings.dnsEnd = performance.now();
        });
        socket.once('connect', () => {
          timings.tcpEnd = performance.now();
          timings.tlsStart = performance.now();
        });
        socket.once('secureConnect', () => {
          timings.tlsEnd = performance.now();
        });
      } else {
        timings.reusedSocket = true;
      }
    });

    req.on('error', (err) => reject(err));
    req.end();
  });
}

function calculateStats(samples) {
  if (samples.length === 0) return { min: 0, max: 0, median: 0, p95: 0, p99: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const median = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  return { min, max, median, p95, p99, avg };
}

async function runBenchmark() {
  console.log('=== SUPABASE LATENCY BENCHMARK (INDIA -> AP-NORTHEAST-1 TOKYO) ===');
  console.log(`Target: ${supabaseUrl}`);
  console.log(`Host: ${hostname}\n`);

  // 1. DNS Measurement
  console.log('1. Measuring DNS Resolution (25 samples)...');
  const dnsSamples = await measureDns(25);
  const dnsStats = calculateStats(dnsSamples);
  console.log(`   DNS Stats (ms): Min=${dnsStats.min.toFixed(1)}, Median=${dnsStats.median.toFixed(1)}, p95=${dnsStats.p95.toFixed(1)}, p99=${dnsStats.p99.toFixed(1)}, Max=${dnsStats.max.toFixed(1)}`);

  // 2. Cold TLS Connections (without Keep-Alive, 10 samples)
  console.log('\n2. Measuring Cold TLS Connections (10 samples)...');
  const coldSamples = [];
  const coldTcp = [];
  const coldTls = [];
  for (let i = 0; i < 10; i++) {
    try {
      const res = await timedRequest(coldAgent);
      coldSamples.push(res.totalDuration);
      coldTcp.push(res.tcpTime);
      coldTls.push(res.tlsTime);
      await new Promise((r) => setTimeout(r, 100));
    } catch (err) {
      console.warn('Cold sample error:', err.message);
    }
  }
  const coldStats = calculateStats(coldSamples);
  const tcpStats = calculateStats(coldTcp);
  const tlsStats = calculateStats(coldTls);
  console.log(`   Cold Connection Total (ms): Min=${coldStats.min.toFixed(1)}, Median=${coldStats.median.toFixed(1)}, p95=${coldStats.p95.toFixed(1)}, Max=${coldStats.max.toFixed(1)}`);
  console.log(`   TCP Handshake (ms): Median=${tcpStats.median.toFixed(1)}`);
  console.log(`   TLS Handshake (ms): Median=${tlsStats.median.toFixed(1)}`);

  // 3. Warm Connections (with HTTP Keep-Alive / Connection Reuse, 25 samples)
  console.log('\n3. Measuring Warm / Reused HTTP Keep-Alive Queries (25 samples)...');
  // Primer request to warm connection
  await timedRequest(keepAliveAgent);

  const warmSamples = [];
  const ttfbSamples = [];
  for (let i = 0; i < 25; i++) {
    try {
      const res = await timedRequest(keepAliveAgent);
      warmSamples.push(res.totalDuration);
      ttfbSamples.push(res.ttfb);
      await new Promise((r) => setTimeout(r, 50));
    } catch (err) {
      console.warn('Warm sample error:', err.message);
    }
  }
  const warmStats = calculateStats(warmSamples);
  const ttfbStats = calculateStats(ttfbSamples);
  console.log(`   Warm Request Total (ms): Min=${warmStats.min.toFixed(1)}, Median=${warmStats.median.toFixed(1)}, p95=${warmStats.p95.toFixed(1)}, p99=${warmStats.p99.toFixed(1)}, Max=${warmStats.max.toFixed(1)}`);
  console.log(`   Time to First Byte (ms): Min=${ttfbStats.min.toFixed(1)}, Median=${ttfbStats.median.toFixed(1)}, p95=${ttfbStats.p95.toFixed(1)}`);

  console.log('\n=== SUMMARY BREAKDOWN ===');
  console.log(`1. DNS Resolution:           ~${dnsStats.median.toFixed(1)} ms`);
  console.log(`2. TCP Syn/Ack (Tokyo RTT):  ~${tcpStats.median.toFixed(1)} ms`);
  console.log(`3. TLS 1.3 Handshake:        ~${tlsStats.median.toFixed(1)} ms`);
  console.log(`4. Cold First Query Total:   ~${coldStats.median.toFixed(1)} ms`);
  console.log(`5. Reused Connection Query:  ~${warmStats.median.toFixed(1)} ms`);
  console.log(`   -> Network RTT to Tokyo explains: ~${(tcpStats.median + tlsStats.median).toFixed(1)} ms of the cold initial request!`);
  console.log(`   -> Database execution itself takes only: ~${(warmStats.median - tcpStats.median).toFixed(1)} ms!`);
}

runBenchmark();
