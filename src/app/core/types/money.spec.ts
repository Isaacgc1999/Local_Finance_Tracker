import {
  ZERO,
  addMoney,
  divMoney,
  divMoneyOrNull,
  money,
  mulMoney,
  permilleOf,
  ratioBasisPoints,
  ratioPermille,
  subMoney,
  sumMoney,
  tryMoney,
} from './money';

describe('Money', () => {
  it('solo acepta enteros seguros', () => {
    expect(money(123)).toBe(123);
    expect(() => money(1.5)).toThrow(TypeError);
    expect(() => money(Number.NaN)).toThrow(TypeError);
    expect(tryMoney(12.3).ok).toBe(false);
    expect(tryMoney(-500).ok).toBe(true);
  });

  it('suma y resta sin float', () => {
    expect(addMoney(money(10), money(20))).toBe(30);
    expect(subMoney(money(275268), money(188437))).toBe(86831); // 2.752,68 − 1.884,37 = 868,31
    expect(sumMoney([money(1), money(2), money(3)])).toBe(6);
    expect(sumMoney([])).toBe(ZERO);
  });

  it('multiplica y divide redondeando al céntimo (half away from zero)', () => {
    expect(mulMoney(money(241268), 0.21)).toBe(50666); // 21 % de 2.412,68 = 506,66 (handoff)
    expect(divMoney(money(188437), 30)).toBe(6281); // 1.884,37 ÷ 30 = 62,81 (handoff)
    expect(divMoney(money(5), 2)).toBe(3); // 2,5 → 3
    expect(divMoney(money(-5), 2)).toBe(-3); // −2,5 → −3
    expect(permilleOf(money(241268), 210)).toBe(50666);
  });

  it('trata la división por cero explícitamente', () => {
    expect(() => divMoney(money(1), 0)).toThrow();
    expect(divMoneyOrNull(money(1), 0)).toBeNull();
    expect(ratioPermille(money(1), ZERO)).toBeNull();
    expect(ratioBasisPoints(money(1), ZERO)).toBeNull();
  });

  it('calcula proporciones enteras', () => {
    expect(ratioPermille(money(188437), money(275268))).toBe(685); // 68,5 %
    expect(ratioBasisPoints(money(188437), money(275268))).toBe(6846); // 68,46 %
    expect(ratioBasisPoints(money(1120919), money(1534280))).toBe(7306); // 73,06 % (handoff: 73,1 %)
  });
});
