import React, { useEffect, useState } from 'react';

interface TimePicker12hProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
}

const toParts = (value: string) => {
  const [rawHour, rawMinute] = value.split(':').map(Number);
  const hour = Number.isFinite(rawHour) ? rawHour : 8;
  return {
    hour12: hour % 12 || 12,
    minute: Number.isFinite(rawMinute) ? String(rawMinute).padStart(2, '0') : '00',
    period: hour >= 12 ? 'PM' : 'AM',
  };
};

export const TimePicker12h: React.FC<TimePicker12hProps> = ({ id, value, onChange }) => {
  const initial = toParts(value);
  const [hour, setHour] = useState(initial.hour12);
  const [minute, setMinute] = useState(initial.minute);
  const [period, setPeriod] = useState(initial.period);

  useEffect(() => {
    const next = toParts(value);
    setHour(next.hour12);
    setMinute(next.minute);
    setPeriod(next.period);
  }, [value]);

  const update = (nextHour: number, nextMinute: string, nextPeriod: string) => {
    let hour24 = nextHour % 12;
    if (nextPeriod === 'PM') hour24 += 12;
    onChange(`${String(hour24).padStart(2, '0')}:${nextMinute}`);
  };

  return (
    <div className="vaango-time-picker" id={id}>
      <select aria-label="Hour" value={hour} onChange={(e) => { const next = Number(e.target.value); setHour(next); update(next, minute, period); }}>
        {Array.from({ length: 12 }, (_, index) => index + 1).map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      <span>:</span>
      <select aria-label="Minute" value={minute} onChange={(e) => { const next = e.target.value; setMinute(next); update(hour, next, period); }}>
        {['00', '15', '30', '45'].map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      <div role="group" aria-label="AM or PM">
        {['AM', 'PM'].map((option) => <button key={option} type="button" className={period === option ? 'active' : ''} onClick={() => { setPeriod(option); update(hour, minute, option); }}>{option}</button>)}
      </div>
    </div>
  );
};
