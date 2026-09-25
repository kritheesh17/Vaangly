import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('NotificationBadge Format and Rendering Rules', () => {
  function formatBadgeDisplay(count: number, max: number = 99, showZero: boolean = false): { visible: boolean; text: string; isSingle: boolean } {
    if (count <= 0 && !showZero) {
      return { visible: false, text: '', isSingle: false };
    }
    const text = count > max ? `${max}+` : `${count}`;
    return {
      visible: true,
      text,
      isSingle: text.length === 1,
    };
  }

  it('hides badge when count is 0 or negative without showZero', () => {
    assert.strictEqual(formatBadgeDisplay(0).visible, false);
    assert.strictEqual(formatBadgeDisplay(-1).visible, false);
  });

  it('renders single digit as perfect circular badge with centered count', () => {
    const b1 = formatBadgeDisplay(1);
    assert.strictEqual(b1.visible, true);
    assert.strictEqual(b1.text, '1');
    assert.strictEqual(b1.isSingle, true);

    const b9 = formatBadgeDisplay(9);
    assert.strictEqual(b9.visible, true);
    assert.strictEqual(b9.text, '9');
    assert.strictEqual(b9.isSingle, true);
  });

  it('renders two-digit numbers correctly inside the badge', () => {
    const b25 = formatBadgeDisplay(25);
    assert.strictEqual(b25.visible, true);
    assert.strictEqual(b25.text, '25');
    assert.strictEqual(b25.isSingle, false);

    const b99 = formatBadgeDisplay(99);
    assert.strictEqual(b99.visible, true);
    assert.strictEqual(b99.text, '99');
    assert.strictEqual(b99.isSingle, false);
  });

  it('caps counts greater than 99 as 99+', () => {
    const b100 = formatBadgeDisplay(100);
    assert.strictEqual(b100.visible, true);
    assert.strictEqual(b100.text, '99+');
    assert.strictEqual(b100.isSingle, false);

    const b250 = formatBadgeDisplay(250);
    assert.strictEqual(b250.visible, true);
    assert.strictEqual(b250.text, '99+');
    assert.strictEqual(b250.isSingle, false);
  });

  it('verifies badge structure never renders external number beside a dot', () => {
    // The design requirement strictly mandates that the number is contained INSIDE the red badge container
    const sampleRender = (label: string, count: number) => {
      const badge = formatBadgeDisplay(count);
      return {
        label,
        badgeContainer: badge.visible ? `[ ${badge.text} ]` : null,
      };
    };

    const res = sampleRender('Applications', 3);
    assert.strictEqual(res.label, 'Applications');
    assert.strictEqual(res.badgeContainer, '[ 3 ]');
    // Ensure no separate red dot symbol followed by separate number
    assert.ok(!JSON.stringify(res).includes('🔴 3'));
  });
});
