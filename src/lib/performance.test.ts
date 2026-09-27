import { describe, expect, it } from 'vitest';
import { RenderBudget } from './performance';

describe('animation frame budget', () => {
  it('reacts to sustained GPU overload within half a second', () => {
    const budget = new RenderBudget();
    for (let i = 0; i < 15; i++) budget.observe(1 / 30, 25);
    expect(budget.level).toBe(1);
  });

  it('does not reduce detail on a 30 Hz screen with a fast GPU', () => {
    const budget = new RenderBudget();
    for (let i = 0; i < 240; i++) budget.observe(1 / 30, 8);
    expect(budget.level).toBe(0);
  });

  it('ignores isolated stalls and limits repeated downshifts', () => {
    const budget = new RenderBudget();
    budget.observe(.1, 60);
    for (let i = 0; i < 60; i++) budget.observe(1 / 60, 8);
    expect(budget.level).toBe(0);
    for (let i = 0; i < 120; i++) budget.observe(.05, 40);
    expect(budget.level).toBe(2);
  });

  it('adapts without GPU timer support, while accepting 30 Hz', () => {
    const budget = new RenderBudget();
    for (let i = 0; i < 60; i++) budget.observe(1 / 30);
    expect(budget.level).toBe(0);
    for (let i = 0; i < 12; i++) budget.observe(.05);
    expect(budget.level).toBe(1);
  });

});
