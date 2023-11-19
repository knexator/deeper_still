// import GUI from "lil-gui"

import { Grid2D } from "./kommon/grid2D";
import { Input, KeyCode } from "./kommon/input";
import { fromCount, zip2 } from "./kommon/kommon";
import { Vec2, mod, towards } from "./kommon/math";
import { canvasFromAscii } from "./kommon/spritePS";

// game logic
type LevelState = typeof cur_state;

let cur_state = {
  size: new Vec2(13, 13),
  holes: holesFromAscii(`
....00.010001
....00.010001
....00.010001
....00..11001
....00..11111
....00...0000
....00...0000
....000000000
......0..00..
......0......
......0......
......0......
......0......
  `),
  magenta_1: {
    pos: new Vec2(8, 5),
  },
  magenta_2: {
    top_left: new Vec2(2, 2),
    horizontal: true,
    length: 5,
    offset: 0,
  },
  magenta_3: {
    exit_pos: new Vec2(3, 6),
    entry_pos: new Vec2(5, 1),
  },
  player: {
    layer: 0,
    drop: 0, // inverse of height
    pos: new Vec2(4, 6),
  },
  downstairs_pos: [
    new Vec2(2, 4),
    new Vec2(11, 11),
    new Vec2(10, 1),
    new Vec2(0, 0),
  ],
  max_visited_layer: 0,
};

type Anim = {
  duration: number,
  progress: number,
  callback: (t: number, state: LevelState) => void,
}
let visual_state = {
  // logic_state: cur_state,
  anims: [] as Anim[],
}

function holesFromAscii(ascii: string): Grid2D<boolean>[] {
  let data = Grid2D.fromAscii(ascii);
  return fromCount(9, k => {
    return data.map((_, char) => char !== '.' && Number(char) >= k);
  })
}

let state_history: LevelState[] = [];

// game graphics
const TILE_SIZE = 40;

let sprites = {
  floors: [
    // hole sprites are 1x1 pixel sized
    canvasFromAscii(["#E6E6EC"], '0'),
    canvasFromAscii(["#A6A6BF"], '0'),
    canvasFromAscii(["#535373"], '0'),
    canvasFromAscii(["#333346"], '0'),
  ],
  player: canvasFromAscii(
    ["#C1C1D2", "#8080A4", "#333346"],
    `
      .000.
      .000.
      22122
      .212.
      .2.2.
    `
  ),
  downstairs: canvasFromAscii(
    ["#E6E6EC", "#C1C1D2", "#8080A4", "#333346", "#0E0E12"],
    `
      00000
      11111
      22222
      33333
      44444
    `
  ),
  upstairs: canvasFromAscii(
    ["#C1C1D2"],
    `
      ..0..
      .0.0.
      0...0
      ..0..
      ..0..
    `
  ),
  magenta_crate: canvasFromAscii(
    ["#FF00FF"],
    `
      00000
      0...0
      0...0
      0...0
      00000
    `
  ),
  magenta_wire_h: canvasFromAscii(
    ["#FF00FF"],
    `
      .....
      .....
      0.0.0
      .....
      .....
    `
  ),
  magenta_wire_left: canvasFromAscii(
    ["#FF00FF"],
    `
      .....
      .0...
      .00.0
      .0...
      .....
    `
  ),
  magenta_wire_right: canvasFromAscii(
    ["#FF00FF"],
    `
      .....
      ...0.
      0.00.
      ...0.
      .....
    `
  ),
  magenta_exit: canvasFromAscii(
    ["#FF00FF"],
    `
      .000.
      00000
      00000
      00000
      .000.
    `
  ),
  magenta_entry: canvasFromAscii(
    ["#FF00FF"],
    `
      .....
      .000.
      .0.0.
      .000.
      .....
    `
  ),
}

const input = new Input();
const canvas = document.querySelector<HTMLCanvasElement>("#game_canvas")!;
const ctx = canvas.getContext("2d")!;

canvas.width = cur_state.size.x * TILE_SIZE;
canvas.height = cur_state.size.y * TILE_SIZE;

ctx.imageSmoothingEnabled = false;

// general stuff
const DIRS = {
  right: new Vec2(1, 0),
  left: new Vec2(-1, 0),
  down: new Vec2(0, 1),
  up: new Vec2(0, -1),
};

type PlayerAction = "up" | "down" | "left" | "right" | "undo"
let input_queue: PlayerAction[] = [];

document.addEventListener("keydown", (ev: KeyboardEvent) => {
  let action = mapKeyToAction(ev.code, {
    "up": [KeyCode.ArrowUp, KeyCode.KeyW],
    "down": [KeyCode.ArrowDown, KeyCode.KeyS],
    "right": [KeyCode.ArrowRight, KeyCode.KeyD],
    "left": [KeyCode.ArrowLeft, KeyCode.KeyA],
    "undo": [KeyCode.KeyZ, KeyCode.KeyU],
  });
  if (action !== null) input_queue.push(action);
});

function mapKeyToAction(key: string, map: Record<PlayerAction, KeyCode[]>): PlayerAction | null {
  for (const [action, keys] of Object.entries(map)) {
    if (keys.some(k => k === key)) {
      return action as PlayerAction;
    }
  }
  return null;
}

function cloneLevelState(old_state: LevelState): LevelState {
  return {
    size: old_state.size,
    holes: old_state.holes,
    magenta_1: {
      pos: old_state.magenta_1.pos,
    },
    magenta_2: {
      horizontal: old_state.magenta_2.horizontal,
      top_left: old_state.magenta_2.top_left,
      length: old_state.magenta_2.length,
      offset: old_state.magenta_2.offset,
    },
    magenta_3: {
      entry_pos: old_state.magenta_3.entry_pos,
      exit_pos: old_state.magenta_3.exit_pos,
    },
    player: {
      layer: old_state.player.layer,
      drop: old_state.player.drop,
      pos: old_state.player.pos,
    },
    downstairs_pos: old_state.downstairs_pos.map(x => x),
    max_visited_layer: old_state.max_visited_layer,
  };
}

function findDropAt(pos: Vec2, max_layer: number, holes: Grid2D<boolean>[]): number {
  let cur_drop = 0;
  while (cur_drop < max_layer) {
    if (!holes[cur_drop].getV(pos)) {
      break;
    }
    cur_drop += 1;
  }
  return cur_drop;
}

function makePlayerBumpAnim(pos: Vec2, dir: Vec2): Anim {
  return makeBumpAnim(pos, dir, (state, v) => { state.player.pos = v });
}

function makeBumpAnim(pos: Vec2, dir: Vec2, setter: (state: LevelState, v: Vec2) => void): Anim {
  return {
    progress: 0,
    duration: 0.05,
    callback: (t, state) => {
      let d = Math.min(t, 1 - t) * .4;
      setter(state, pos.add(dir.scale(d)));
    }
  }
}

function makePlayerMoveAnim(pos: Vec2, dir: Vec2): Anim {
  return makeMoveAnim(pos, dir, (state, v) => { state.player.pos = v });
}

function makeMoveAnim(pos: Vec2, dir: Vec2, setter: (state: LevelState, v: Vec2) => void): Anim {
  return {
    progress: 0,
    duration: 0.05,
    callback: (t, state) => {
      setter(state, pos.add(dir.scale(t)));
    }
  }
}

type Thing = "oob" | "none" | "player" | "upstair" | "downstair" | "magenta_1" | "magenta_2_cart" | "magenta_2_rail" | "magenta_3_entry" | "magenta_3_exit"

function thingAt(state: LevelState, pos: Vec2): Thing {
  if (pos.equals(state.player.pos)) return "player";
  if (!Vec2.inBounds(pos, state.size)) return "oob";
  if (state.player.layer > 0 && state.downstairs_pos[state.player.layer - 1].equals(pos)) return "upstair";
  if (state.player.layer + 1 < state.downstairs_pos.length && state.downstairs_pos[state.player.layer].equals(pos)) return "downstair";
  if (state.max_visited_layer >= 1 && state.magenta_1.pos.equals(pos)) return "magenta_1"
  if (state.max_visited_layer >= 2) {
    if (!state.magenta_2.horizontal) throw new Error("unimplemented");
    let cart_pos = new Vec2(state.magenta_2.offset, 0).add(state.magenta_2.top_left);
    if (pos.equals(cart_pos)) return "magenta_2_cart"
    let delta = pos.sub(state.magenta_2.top_left);
    if (delta.y === 0 && delta.x >= 0 && delta.x < state.magenta_2.length && delta.x !== state.magenta_2.offset) {
      return "magenta_2_rail";
    }
  }
  if (state.max_visited_layer >= 3) {
    if (pos.equals(state.magenta_3.entry_pos)) return "magenta_3_entry"
    if (pos.equals(state.magenta_3.exit_pos)) return "magenta_3_exit"
  }


  return "none";
}

// function canMoveHere(state: LevelState, thing: Thing, thing_target: Thing): boolean {
//   if (thing === "oob" || thing_target === "oob") return false;
//   if (thing === "none" || thing_target === "none") {
//     return true;
//   }
//   if (thing_target === "downstair" || thing_target === "upstair") {
//     return thing === "player";
//   }
//   return false;
// }

// Our whole game logic lives inside this function
function advanceState(state: LevelState, player_action: PlayerAction): [Anim[], boolean] {
  if (player_action === "undo") throw new Error("");
  let player_move = DIRS[player_action];
  let new_player_pos = state.player.pos.add(player_move);
  let anims = [makePlayerMoveAnim(state.player.pos, player_move)];
  let bump_anims: [Anim[], boolean] = [[makePlayerBumpAnim(state.player.pos, player_move)], false];

  // could be nice to have the whole logic here:
  // let thing_at_target = thingAt(state, new_player_pos);
  // if (canMoveHere(state, "player", thing_at_target)) {
  //  missing specific logic - moving into an upstair should change the layer, for example
  //   return anims;
  // } else {
  //   return bump_anims;
  // }

  if (!Vec2.inBounds(new_player_pos, state.size)) return bump_anims;

  // go upstairs
  if (state.player.layer > 0 && state.downstairs_pos[state.player.layer - 1].equals(new_player_pos)) {
    let new_layer = state.player.layer - 1;
    anims.push({
      duration: 0.1,
      progress: 0,
      callback: (t, state) => {
        if (t >= .6) {
          state.player.layer = new_layer;
          state.player.drop = 0; // TODO: bug here
        }
      }
    });
    return [anims, true];
  }

  // go downstairs
  if (new_player_pos.equals(state.downstairs_pos[state.player.layer])) {
    let new_layer = state.player.layer + 1;
    if (state.player.layer >= state.downstairs_pos.length) {
      // TODO: END GAME
      return bump_anims;
    }
    anims.push({
      duration: 0.1,
      progress: 0,
      callback: (t, state) => {
        if (t >= .6) {
          state.player.layer = new_layer;
          state.player.drop = 0; // TODO: bug here
          state.max_visited_layer = Math.max(state.max_visited_layer, state.player.layer);
        }
      }
    });
    return [anims, true];
  }

  // TODO: drop anim
  let new_player_drop = findDropAt(new_player_pos, state.player.layer, state.holes);

  if (state.max_visited_layer >= 3) {
    // mechanic 3: portal
    if (new_player_pos.equals(state.magenta_3.entry_pos)) {
      new_player_pos = state.magenta_3.exit_pos;
      new_player_drop = findDropAt(new_player_pos, state.player.layer, state.holes);
      state.player.pos = new_player_pos;
      state.player.drop = new_player_drop;
      state.magenta_3.exit_pos = state.magenta_3.entry_pos;
      state.magenta_3.entry_pos = new_player_pos;
      return [[], true]; // todo: portal anim
    } else if (new_player_pos.equals(state.magenta_3.exit_pos)) {
      let magenta_crate_drop = findDropAt(state.magenta_3.exit_pos, state.player.layer, state.holes);
      if (magenta_crate_drop !== state.player.drop || state.player.drop !== new_player_drop) {
        // can't stand on portal exit
        return bump_anims;
      }
      // player is pushing the crate
      let new_magenta_crate_pos = state.magenta_3.exit_pos.add(player_move);
      if (thingAt(state, new_magenta_crate_pos) !== "none") return bump_anims;
      let new_magenta_crate_drop = findDropAt(new_magenta_crate_pos, state.player.layer, state.holes);
      if (new_magenta_crate_drop < state.player.drop) return bump_anims; //null; // player can't push the crate up
      anims.push(makeMoveAnim(state.magenta_3.exit_pos, player_move, (state, vec) => {
        state.magenta_3.exit_pos = vec;
      }))
      state.magenta_3.exit_pos = new_magenta_crate_pos;
      state.player.pos = new_player_pos;
      return [anims, true];
    }
  }

  if (state.max_visited_layer >= 2) {
    // mechanic 2: rail
    if (!state.magenta_2.horizontal) throw new Error("unimplemented");
    let old_rail_pos = new Vec2(state.magenta_2.offset, 0).add(state.magenta_2.top_left);
    if (state.player.pos.equals(old_rail_pos)) {
      if (player_move.y === 0) {
        let new_offset = state.magenta_2.offset + player_move.x;
        if (new_offset >= 0 && new_offset < state.magenta_2.length) {
          let old_offset = state.magenta_2.offset;
          anims.push({
            progress: 0,
            duration: .05,
            callback: (t, state) => {
              state.magenta_2.offset = old_offset + t * player_move.x;
            },
          })
          state.magenta_2.offset = new_offset;
          state.player.pos = new_player_pos;
          state.player.drop = 0;
          return [anims, true];
        }
      }
    } else {
      // player can't overlap rails
      let delta = new_player_pos.sub(state.magenta_2.top_left);
      if (delta.y === 0 && delta.x >= 0 && delta.x < state.magenta_2.length && delta.x !== state.magenta_2.offset) {
        return bump_anims; // null;
      }
    }
  }

  if (new_player_drop < state.player.drop) return bump_anims; // player can't move up

  if (state.max_visited_layer >= 1) {
    // mechanic 1: crate
    if (new_player_pos.equals(state.magenta_1.pos)) {
      // is the player pushing the crate or standing on it?
      let magenta_crate_drop = findDropAt(state.magenta_1.pos, state.player.layer, state.holes);
      if (magenta_crate_drop === state.player.drop) {
        // player is pushing the crate
        let new_magenta_crate_pos = state.magenta_1.pos.add(player_move);
        if (thingAt(state, new_magenta_crate_pos) !== "none") return bump_anims;
        // if (!Vec2.inBounds(new_magenta_crate_pos, state.size)) return bump_anims;

        let new_magenta_crate_drop = findDropAt(new_magenta_crate_pos, state.player.layer, state.holes);
        if (new_magenta_crate_drop < state.player.drop) return bump_anims; // player can't push the crate up
        anims.push(makeMoveAnim(state.magenta_1.pos, player_move, (state, v) => { state.magenta_1.pos = v }))
        // state.magenta_1.pos = new_magenta_crate_pos;
        // state.player.pos = new_player_pos;
      } else {
        // player is standing on the crate
        state.player.pos = new_player_pos;
        state.player.drop = magenta_crate_drop - 1;
        return [anims, true];
      }
    }
  }

  state.player.pos = new_player_pos;
  state.player.drop = new_player_drop;

  return [anims, true];
}

let last_timestamp = 0;
// main loop; game logic lives here
function every_frame(cur_timestamp: number) {
  // in seconds
  let delta_time = (cur_timestamp - last_timestamp) / 1000;
  last_timestamp = cur_timestamp;
  input.startFrame();

  // reset
  if (input.keyboard.wasPressed(KeyCode.KeyR)) {
    if (state_history.length > 0) {
      state_history.push(cloneLevelState(cur_state));
      cur_state = cloneLevelState(state_history[0]);
    }
  }

  // player move
  if (visual_state.anims.length === 0) {
    let player_action = input_queue.shift();
    if (player_action === "undo") {
      if (state_history.length > 0) {
        cur_state = state_history.pop()!;
      }
      input_queue = [];
    } else if (player_action !== undefined) {
      let prev_state = cloneLevelState(cur_state);
      let [anims, undoable] = advanceState(cur_state, player_action);
      visual_state.anims = visual_state.anims.concat(anims);
      if (undoable) {
        state_history.push(prev_state);
      }
    }
  }

  // animation progress
  visual_state.anims = visual_state.anims.filter(anim => {
    anim.progress = towards(anim.progress, 1, delta_time / anim.duration);
    anim.callback(anim.progress, cur_state);
    return anim.progress < 1;
  });

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  let bottommost = true;
  for (let floor_drop = cur_state.player.layer; floor_drop >= 0; floor_drop--) {
    cur_state.holes[floor_drop].forEachV((pos, is_hole) => {
      let draw_floor = bottommost || !is_hole;
      if (draw_floor) {
        drawSpriteAtDrop(cur_state.player.pos, sprites.floors[floor_drop], pos, floor_drop);
      }
    });
    bottommost = false;
  }
  if (cur_state.player.layer > 0) {
    drawSprite(sprites.upstairs, cur_state.downstairs_pos[cur_state.player.layer - 1]);
  }
  drawSprite(sprites.downstairs, cur_state.downstairs_pos[cur_state.player.layer]);
  if (cur_state.max_visited_layer >= 1) {
    drawSprite(sprites.magenta_crate, cur_state.magenta_1.pos);
  }
  if (cur_state.max_visited_layer >= 2) {
    if (!cur_state.magenta_2.horizontal) throw new Error("unimplemented");
    drawSprite(sprites.magenta_wire_left, cur_state.magenta_2.top_left);
    for (let k = 1; k + 1 < cur_state.magenta_2.length; k++) {
      drawSprite(sprites.magenta_wire_h, new Vec2(k, 0).add(cur_state.magenta_2.top_left));
    }
    drawSprite(sprites.magenta_wire_right, new Vec2(cur_state.magenta_2.length - 1, 0).add(cur_state.magenta_2.top_left));
    drawSprite(sprites.magenta_crate, new Vec2(cur_state.magenta_2.offset, 0).add(cur_state.magenta_2.top_left));
  }
  if (cur_state.max_visited_layer >= 3) {
    drawSprite(sprites.magenta_entry, cur_state.magenta_3.entry_pos);
    drawSprite(sprites.magenta_exit, cur_state.magenta_3.exit_pos);
  }
  drawSpriteAtDrop(cur_state.player.pos, sprites.player, cur_state.player.pos, cur_state.player.drop);

  // cur_state.walls.forEachV((pos, is_wall) => drawSprite(is_wall ? sprites.wall : sprites.background, pos));
  // cur_state.targets.forEach(pos => drawSprite(sprites.target, pos));

  // if (remaining_anim_t === 0) {
  //   // draw when nothing is moving
  //   cur_state.crates.forEach(pos => drawSprite(sprites.crate, pos));
  //   drawSprite(sprites.player, cur_state.player);
  // } else {
  //   // draw during animation
  //   if (state_history.length < 2) throw new Error();
  //   let prev_state = at(state_history, -2);
  //   for (const [prev_crate, cur_crate] of zip2(prev_state.crates, cur_state.crates)) {
  //     drawSprite(sprites.crate, Vec2.lerp(cur_crate, prev_crate, remaining_anim_t));
  //   }
  //   drawSprite(sprites.player, Vec2.lerp(cur_state.player, prev_state.player, remaining_anim_t));
  // }

  requestAnimationFrame(every_frame);
}

function drawSpriteAtDrop(eye_pos: Vec2, sprite: HTMLCanvasElement, pos: Vec2, drop: number) {
  let D = 50;
  let scale = D / (drop + D);
  let top_left_corner = pos.sub(eye_pos).scale(scale).add(eye_pos);
  ctx.drawImage(sprite,
    top_left_corner.x * TILE_SIZE, top_left_corner.y * TILE_SIZE,
    Math.ceil(TILE_SIZE * scale), Math.ceil(TILE_SIZE * scale));
}

function drawSprite(sprite: HTMLCanvasElement, { x, y }: Vec2) {
  ctx.drawImage(sprite,
    x * TILE_SIZE, y * TILE_SIZE,
    TILE_SIZE, TILE_SIZE);
}

////// library stuff

function single<T>(arr: T[]) {
  if (arr.length === 0) {
    throw new Error("the array was empty");
  } else if (arr.length > 1) {
    throw new Error(`the array had more than 1 element: ${arr}`);
  } else {
    return arr[0];
  }
}

function at<T>(arr: T[], index: number): T {
  if (arr.length === 0) throw new Error("can't call 'at' with empty array");
  return arr[mod(index, arr.length)];
}

const loading_screen_element = document.querySelector<HTMLDivElement>("#loading_screen")!;
loading_screen_element.innerText = "Press to start!";
document.addEventListener("pointerdown", _event => {
  loading_screen_element.style.opacity = "0";
  requestAnimationFrame(every_frame);
}, { once: true });
