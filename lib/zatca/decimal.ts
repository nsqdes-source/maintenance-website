/** Exact rational arithmetic. Never converts monetary values through Number. */
export class Decimal {
  constructor(readonly numerator: bigint, readonly denominator: bigint = BigInt(1)) {
    if (denominator <= BigInt(0)) throw new Error('Invalid denominator');
  }
  static parse(value: string): Decimal {
    if (!/^-?\d+(\.\d{1,18})?$/.test(value)) throw new Error('Invalid decimal');
    const negative = value.startsWith('-');
    const [whole, fraction = ''] = value.replace(/^-/, '').split('.');
    return new Decimal(BigInt(whole + fraction) * BigInt(negative ? -1 : 1), BigInt(10) ** BigInt(fraction.length));
  }
  add(b: Decimal): Decimal { return new Decimal(this.numerator * b.denominator + b.numerator * this.denominator, this.denominator * b.denominator); }
  subtract(b: Decimal): Decimal { return this.add(new Decimal(-b.numerator, b.denominator)); }
  multiply(b: Decimal): Decimal { return new Decimal(this.numerator * b.numerator, this.denominator * b.denominator); }
  divide(b: Decimal): Decimal {
    if (b.numerator <= BigInt(0)) throw new Error('Positive divisor required');
    return new Decimal(this.numerator * b.denominator, this.denominator * b.numerator);
  }
  equals(b: Decimal): boolean { return this.numerator * b.denominator === b.numerator * this.denominator; }
  positive(): boolean { return this.numerator > BigInt(0); }
  negative(): boolean { return this.numerator < BigInt(0); }
  fixed(places = 2): string {
    const scale = BigInt(10) ** BigInt(places);
    const negative = this.numerator < BigInt(0);
    const absolute = negative ? -this.numerator : this.numerator;
    const scaled = absolute * scale;
    let rounded = scaled / this.denominator;
    if ((scaled % this.denominator) * BigInt(2) >= this.denominator) rounded += BigInt(1);
    const text = rounded.toString().padStart(places + 1, '0');
    return `${negative && rounded !== BigInt(0) ? '-' : ''}${places ? text.slice(0, -places) + '.' + text.slice(-places) : text}`;
  }
  round(): Decimal { return Decimal.parse(this.fixed()); }
}
