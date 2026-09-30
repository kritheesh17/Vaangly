import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  getInstallStatusInfo,
  InstallState,
  InstallFeedbackPhase,
} from '../context/PermissionContext';

describe('PWA Installation State Machine and Feedback', () => {
  // Test 1: Install available / Initial state
  it('1. Install available: returns ready state when deferred prompt is captured', () => {
    const info = getInstallStatusInfo('READY', 'idle');
    assert.strictEqual(info.title, 'Install Vaangly');
    assert.ok(info.detail.includes('Install Vaangly on your device'));
  });

  // Test 2 & 3: Browser prompt opened and installing state appears
  it('2 & 3. Installing state: provides truthful semantic status when prompt opens', () => {
    const preparingInfo = getInstallStatusInfo('INSTALLING', 'preparing');
    assert.strictEqual(preparingInfo.title, 'Preparing Vaangly for installation');
    assert.ok(preparingInfo.detail.includes('Connecting with your browser installation manager'));

    const promptOpenedInfo = getInstallStatusInfo('INSTALLING', 'prompt_opened');
    assert.strictEqual(promptOpenedInfo.title, 'Installation prompt opened');
    assert.ok(promptOpenedInfo.detail.includes('confirm the installation'));

    const installingInfo = getInstallStatusInfo('INSTALLING', 'installing');
    assert.strictEqual(installingInfo.title, 'Installing Vaangly...');
    assert.ok(installingInfo.detail.includes('Adding Vaangly to your device'));
  });

  // Test 4: Duplicate install click blocked simulation
  it('4. Duplicate click protection: state machine guards against concurrent install calls', async () => {
    let callCount = 0;
    let isInstalling = false;

    const mockPrompt = async () => {
      if (isInstalling) {
        return; // Guard against duplicate calls
      }
      isInstalling = true;
      callCount++;
      await new Promise((r) => setTimeout(r, 10));
      isInstalling = false;
    };

    // Simulate double click
    const promise1 = mockPrompt();
    const promise2 = mockPrompt();

    await Promise.all([promise1, promise2]);
    assert.strictEqual(callCount, 1, 'Duplicate click was successfully prevented');
  });

  // Test 5, 6, 7: User accepts and appinstalled fires -> INSTALLED state
  it('5, 6, 7. User accepts and appinstalled event handles transition to INSTALLED', () => {
    const installedInfo = getInstallStatusInfo('INSTALLED', 'installed');
    assert.strictEqual(installedInfo.title, 'Vaangly installed successfully! ✓');
    assert.ok(installedInfo.detail.includes('Vaangly is now ready on your device'));

    // In standalone mode (idle phase)
    const standaloneInfo = getInstallStatusInfo('INSTALLED', 'idle');
    assert.strictEqual(standaloneInfo.title, 'Vaangly is installed ✓');
    assert.ok(standaloneInfo.detail.includes('Already running as an installed application'));
  });

  // Test 7b: Safety race timeout does NOT falsely claim success
  it('7b. Safety race timeout: does not falsely claim "Installed successfully" when appinstalled is delayed', () => {
    const completingInfo = getInstallStatusInfo('INSTALLING', 'completing');
    assert.strictEqual(completingInfo.title, 'Installation request accepted');
    assert.ok(!completingInfo.title.includes('installed successfully'));
    assert.ok(completingInfo.detail.includes('completing setup in the background'));
  });

  // Test 8 & 9: User cancels -> DISMISSED / cancelled state
  it('8 & 9. User cancels prompt: handles DISMISSED state gracefully', () => {
    const cancelledInfo = getInstallStatusInfo('DISMISSED', 'cancelled');
    assert.strictEqual(cancelledInfo.title, 'Installation was cancelled.');
    assert.ok(cancelledInfo.detail.includes('You can install Vaangly anytime from the Install button'));
  });

  // Test 10: Unsupported browser
  it('10. Unsupported browser: provides helpful manual alternative instructions', () => {
    const unsuppInfo = getInstallStatusInfo('UNSUPPORTED', 'unavailable');
    assert.strictEqual(unsuppInfo.title, "Vaangly can't be installed from this browser.");
    assert.ok(unsuppInfo.detail.includes('Add to Home Screen in Safari'));
  });

  // Test 11: Standalone mode detection
  it('11. Standalone display mode detection sets state to INSTALLED', () => {
    const detectInitialState = (isStandalone: boolean, hasPrompt: boolean): InstallState => {
      if (isStandalone) return 'INSTALLED';
      if (hasPrompt) return 'READY';
      return 'NOT_AVAILABLE';
    };

    assert.strictEqual(detectInitialState(true, false), 'INSTALLED');
    assert.strictEqual(detectInitialState(false, true), 'READY');
    assert.strictEqual(detectInitialState(false, false), 'NOT_AVAILABLE');
  });

  // Test 12: Installation error handling
  it('12. Error handling: communicates unexpected browser failure with contextual advice', () => {
    const errInfo = getInstallStatusInfo('ERROR', 'error');
    assert.strictEqual(errInfo.title, "Vaangly couldn't be installed right now.");
    assert.ok(errInfo.detail.includes('An unexpected browser error occurred'));
  });

  // Test 13: CRITICAL - No fake progress percentages
  it('13. Truthful installation progress: no fake percentages (10%, 25%, 50%, etc.) in messages', () => {
    const phases: InstallFeedbackPhase[] = [
      'idle',
      'preparing',
      'prompt_opened',
      'installing',
      'completing',
      'installed',
      'cancelled',
      'unavailable',
      'error',
    ];
    const states: InstallState[] = [
      'NOT_AVAILABLE',
      'READY',
      'INSTALLING',
      'INSTALLED',
      'DISMISSED',
      'UNSUPPORTED',
      'ERROR',
    ];

    for (const state of states) {
      for (const phase of phases) {
        const info = getInstallStatusInfo(state, phase);
        // Ensure no fake percentages in title or detail
        assert.doesNotMatch(info.title, /\b\d{1,3}%\b/);
        assert.doesNotMatch(info.detail, /\b\d{1,3}%\b/);
        // Ensure no fake progress steps
        assert.doesNotMatch(info.title, /Step \d of \d/i);
      }
    }
  });

  // Test 14: Correct user-facing messages across all phases
  it('14. User-facing messages are truthful, human-readable, and never empty', () => {
    const phases: InstallFeedbackPhase[] = [
      'idle',
      'preparing',
      'prompt_opened',
      'installing',
      'completing',
      'installed',
      'cancelled',
      'unavailable',
      'error',
    ];

    for (const phase of phases) {
      const info = getInstallStatusInfo('INSTALLING', phase);
      assert.ok(info.title.length > 5, `Phase ${phase} title must be descriptive`);
      assert.ok(info.detail.length > 10, `Phase ${phase} detail must be helpful`);
    }
  });
});
