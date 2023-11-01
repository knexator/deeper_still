export function randomFloat(low_inclusive: number, high_exclusive: number): number {
    return low_inclusive + Math.random() * (high_exclusive - low_inclusive);
}

export function randomInt(low_inclusive: number, high_exclusive: number): number {
    return low_inclusive + Math.floor(Math.random() * (high_exclusive - low_inclusive));
}

export function randomCentered(half_size: number): number {
    return (Math.random() * 2 - 1) * half_size;
}

/** random float between -.5 & .5 */
export function rand05(): number {
    return Math.random() - .5;
}


export function max(arr: number[]) {
    if (arr.length === 0) {
        return undefined
    }
    return arr[argmax(arr)!];
}

export function argmax(arr: number[]) {
    if (arr.length === 0) {
        return undefined
    }
    let res = 0;
    let biggest = arr[0];
    for (let k = 1; k < arr.length; k++) {
        if (arr[k] > biggest) {
            biggest = arr[k];
            res = k;
        }
    }
    return res;
}

export function lerp(a: number, b: number, t: number): number {
    return a * (1 - t) + b * t;
}

/** t === inverseLerp(a, b, lerp(a, b, t)) */
export function inverseLerp(a: number, b: number, value: number): number {
    if (a === b) return 0.5;
    let t = (value - a) / (b - a);
    return t;
}

export function towards(cur: number, target: number, max_delta: number): number {
    if (cur > target) {
        return Math.max(cur - max_delta, target);
    } else if (cur < target) {
        return Math.min(cur + max_delta, target);
    } else {
        return target;
    }
}

export function mod(n: number, m: number) {
    return ((n % m) + m) % m;
}

export function wrap(value: number, low: number, high: number) {
    return mod(value - low, high - low) + low;
}

export function remap(value: number, old_a: number, old_b: number, new_a: number, new_b: number) {
    let t = (value - old_a) / (old_b - old_a);
    return t * (new_b - new_a) + new_a;
}

export function smoothstep(toZero: number, toOne: number, value: number) {
    let x = Math.max(0, Math.min(1, (value - toZero) / (toOne - toZero)));
    return x * x * (3 - 2 * x);
};

export function clamp(value: number, min_inclusive: number, max_inclusive: number): number {
    return Math.max(min_inclusive, Math.min(max_inclusive, value));
}

export function inRange(value: number, min_inclusive: number, max_exclusive: number): boolean {
    return value >= min_inclusive && value < max_exclusive;
}

export function onBorder(value: number, min_inclusive: number, max_exclusive: number): boolean {
    return value == min_inclusive || (value + 1) === max_exclusive;
}

// from https://stackoverflow.com/questions/2450954/how-to-randomize-shuffle-a-javascript-array
export function shuffle<T>(array: T[]) {
    let currentIndex = array.length, randomIndex;
    // While there remain elements to shuffle.
    while (currentIndex != 0) {
        // Pick a remaining element.
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        // And swap it with the current element.
        [array[currentIndex], array[randomIndex]] = [
            array[randomIndex], array[currentIndex]];
    }
    return array;
}

export function randomChoice<T>(arr: T[]) {
    if (arr.length === 0) {
        throw new Error("can't choose out of an empty array");
    }
    return arr[Math.floor(Math.random() * arr.length)];
}

// Use objects instead of arrays: https://jsben.ch/FgKVi
export class Vec4 {
    constructor(
        public x: number = 0.0,
        public y: number = 0.0,
        public z: number = 0.0,
        public w: number = 0.0,
    ) { }

    static scale(v: Vec4, s: number, out?: Vec4): Vec4 {
        out = out || new Vec4();
        out.x = v.x * s;
        out.y = v.y * s;
        out.z = v.z * s;
        out.w = v.w * s;
        return out;
    }

    static zero = new Vec4(0, 0, 0, 0);
    static one = new Vec4(1, 1, 1, 1);

    toArray(): [number, number, number, number] {
        return [this.x, this.y, this.z, this.w];
    }
}

type CardinalDirection = "xpos" | "xneg" | "ypos" | "yneg";

export class Vec2 {
    constructor(
        public x: number = 0.0,
        public y: number = 0.0,
    ) { }

    toString(): string {
        return `Vec2(${this.x}, ${this.y})`;
    }

    static readonly zero = new Vec2(0, 0);
    static readonly one = new Vec2(1, 1);

    set(x: number, y: number): Vec2 {
        this.x = x;
        this.y = y;
        return this;
    }

    copyFrom(src: Vec2): Vec2 {
        this.x = src.x;
        this.y = src.y;
        return this;
    }

    copyTo(out?: Vec2): Vec2 {
        out = out || new Vec2();
        out.x = this.x;
        out.y = this.y;
        return out;
    }

    angleTo(other: Vec2): number {
        return Math.atan2(other.y - this.y, other.x - this.x);
    }

    add(other: Vec2, out?: Vec2): Vec2 {
        out = out || this;
        out.x = this.x + other.x;
        out.y = this.y + other.y;
        return out;
    }

    sub(other: Vec2, out?: Vec2): Vec2 {
        out = out || this;
        out.x = this.x - other.x;
        out.y = this.y - other.y;
        return out;
    }

    mul(other: Vec2, out?: Vec2): Vec2 {
        out = out || this;
        out.x = this.x * other.x;
        out.y = this.y * other.y;
        return out;
    }

    scale(factor: number, out?: Vec2): Vec2 {
        out = out || this;
        out.x = this.x * factor;
        out.y = this.y * factor;
        return out;
    }

    equals(other: Vec2): boolean {
        return Vec2.equals(this, other);
    }

    angle() {
        return Math.atan2(this.y, this.x);
    }

    clamp(bounds: Rectangle, out?: Vec2): Vec2 {
        out = out || this;
        out.x = clamp(this.x, bounds.topLeft.x, bounds.topLeft.x + bounds.size.x);
        out.y = clamp(this.y, bounds.topLeft.y, bounds.topLeft.y + bounds.size.y);
        return out;
    }

    static fromPolar(radians: number, length: number): Vec2 {
        return new Vec2(Math.cos(radians) * length, Math.sin(radians) * length);
    }

    static add(a: Vec2, b: Vec2, out?: Vec2): Vec2 {
        out = out || new Vec2();
        out.x = a.x + b.x;
        out.y = a.y + b.y;
        return out;
    }

    static sub(a: Vec2, b: Vec2, out?: Vec2): Vec2 {
        out = out || new Vec2();
        out.x = a.x - b.x;
        out.y = a.y - b.y;
        return out;
    }

    static mul(a: Vec2, b: Vec2, out?: Vec2): Vec2 {
        out = out || new Vec2();
        out.x = a.x * b.x;
        out.y = a.y * b.y;
        return out;
    }

    static div(a: Vec2, b: Vec2, out?: Vec2): Vec2 {
        out = out || new Vec2();
        out.x = a.x / b.x;
        out.y = a.y / b.y;
        return out;
    }

    static min(a: Vec2, b: Vec2, out?: Vec2): Vec2 {
        out = out || new Vec2();
        out.x = Math.min(a.x, b.x);
        out.y = Math.min(a.y, b.y);
        return out;
    }

    static max(a: Vec2, b: Vec2, out?: Vec2): Vec2 {
        out = out || new Vec2();
        out.x = Math.max(a.x, b.x);
        out.y = Math.max(a.y, b.y);
        return out;
    }

    static round(v: Vec2, out?: Vec2): Vec2 {
        out = out || new Vec2();
        out.x = Math.round(v.x);
        out.y = Math.round(v.y);
        return out;
    }

    static negate(v: Vec2, out?: Vec2): Vec2 {
        out = out || new Vec2();
        out.x = -v.x;
        out.y = -v.y;
        return out;
    }

    static scale(v: Vec2, s: number, out?: Vec2): Vec2 {
        out = out || new Vec2();
        out.x = v.x * s;
        out.y = v.y * s;
        return out;
    }

    static rotate(v: Vec2, radians: number, out?: Vec2): Vec2 {
        out = out || new Vec2();
        let c = Math.cos(radians);
        let s = Math.sin(radians);
        let x = v.x * c - v.y * s;
        out.y = v.x * s + v.y * c;
        out.x = x;
        return out;
    }

    static lerp(a: Vec2, b: Vec2, t: number, out?: Vec2): Vec2 {
        out = out || new Vec2();
        out.x = a.x * (1 - t) + b.x * t;
        out.y = a.y * (1 - t) + b.y * t;
        return out;
    }

    static inBounds(point: Vec2, bounds: Vec2): boolean {
        return inRange(point.x, 0, bounds.x) && inRange(point.y, 0, bounds.y);
    }

    // too niche for here?
    static onBorder(point: Vec2, bounds: Vec2): boolean {
        return onBorder(point.x, 0, bounds.x) || onBorder(point.y, 0, bounds.y);
    }

    static isZero(v: Vec2): boolean {
        return v.x === 0 && v.y === 0;
    }

    static equals(a: Vec2, b: Vec2): boolean {
        return a.x === b.x && a.y === b.y;
    }

    static magSq(v: Vec2): number {
        return v.x * v.x + v.y * v.y;
    }

    static mag(v: Vec2): number {
        return Math.sqrt(Vec2.magSq(v));
    }

    static radians(v: Vec2): number {
        return Math.atan2(v.y, v.x);
    }

    static taxicab(v: Vec2): number {
        return Math.abs(v.x) + Math.abs(v.y);
    }

    static lInf(v: Vec2): number {
        return Math.max(Math.abs(v.x), Math.abs(v.y));
    }

    static map1(v: Vec2, fn: (x: number) => number, out?: Vec2): Vec2 {
        out = out || new Vec2();
        out.x = fn(v.x);
        out.y = fn(v.y);
        return out;
    }

    static map2(a: Vec2, b: Vec2, fn: (a: number, b: number) => number, out?: Vec2): Vec2 {
        out = out || new Vec2();
        out.x = fn(a.x, b.x);
        out.y = fn(a.y, b.y);
        return out;
    }

    static randint(max_exclusive: Vec2, out?: Vec2): Vec2 {
        out = out || new Vec2();
        out.x = Math.floor(Math.random() * max_exclusive.x);
        out.y = Math.floor(Math.random() * max_exclusive.y);
        return out;
    }

    static randunit(out?: Vec2): Vec2 {
        return Vec2.fromRadians(Math.random() * Math.PI * 2, out);
    }

    static fromRadians(radians: number, out?: Vec2): Vec2 {
        out = out || new Vec2();
        out.x = Math.cos(radians);
        out.y = Math.sin(radians);
        return out;
    }

    static isInsideBox(point: Vec2, box_center: Vec2, box_size: Vec2): boolean {
        return (Math.abs(point.x - box_center.x) < box_size.x * .5)
            && (Math.abs(point.y - box_center.y) < box_size.y * .5);
    }

    static roundToCardinal(a: Vec2): CardinalDirection {
        if (Math.abs(a.x) >= Math.abs(a.y)) {
            if (a.x >= 0) {
                return "xpos";
            } else {
                return "xneg";
            }
        } else {
            if (a.y >= 0) {
                return "ypos";
            } else {
                return "yneg";
            }
        }
    }
}

// todo: generalize, error check for too many args
export class Rectangle {
    constructor(
        public topLeft: Vec2,
        public size: Vec2) { }

    static readonly unit = new Rectangle(Vec2.zero, Vec2.one);

    static fromParams(params: {
        topLeft?: Vec2,
        center?: Vec2,
        bottomRight?: Vec2,
        size?: Vec2,
    }): Rectangle {
        let topLeft = new Vec2();
        let size = new Vec2();

        if (params.topLeft !== undefined) {
            topLeft.copyFrom(params.topLeft);
            if (params.size !== undefined) {
                size.copyFrom(params.size);
            } else if (params.bottomRight !== undefined) {
                Vec2.sub(params.bottomRight, topLeft, size);
            } else if (params.center !== undefined) {
                Vec2.sub(params.center, topLeft, size);
                Vec2.scale(size, 2, size);
            } else {
                throw new Error("not enough data to compute rect");
            }
            return new Rectangle(topLeft, size);
        } else if (params.center !== undefined) {
            if (params.size !== undefined) {
                size.copyFrom(params.size);
            } else if (params.bottomRight !== undefined) {
                Vec2.sub(params.bottomRight, params.center, size);
                Vec2.scale(size, 2, size);
            } else {
                throw new Error("not enough data to compute rect");
            }
            Vec2.sub(params.center, Vec2.scale(size, .5), topLeft);
            return new Rectangle(topLeft, size);
        } else {
            throw new Error("unimplemented");
        }
    }
}
