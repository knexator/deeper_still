// import GUI from "lil-gui"

import { Grid2D } from "./kommon/grid2D";
import { Input, KeyCode } from "./kommon/input";
import { fromCount, zip2 } from "./kommon/kommon";
import { Vec2, mod, towards } from "./kommon/math";
import { canvasFromAscii } from "./kommon/spritePS";

// game logic
type LevelState = typeof initial_state;

let initial_state = {
  size: new Vec2(13, 13),
  holes: holesFromAscii(`
......01.....
......01.....
......01.....
......01.....
......21.....
......20.....
......00.....
......0000000
.........0...
.........0...
.........0...
.........0...
.........0...
  `),
  magenta_1: {
    pos: new Vec2(10, 4),
  },
  magenta_2: {
    top_left: new Vec2(3, 3),
    horizontal: true,
    length: 7,
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
    new Vec2(4, 4),
    new Vec2(0, 0),
  ],
  max_visited_layer: 0,
};

function holesFromAscii(ascii: string): Grid2D<boolean>[] {
  let data = Grid2D.fromAscii(ascii);
  return fromCount(9, k => {
    return data.map((_, char) => char !== '.' && Number(char) >= k);
  })
}

let state_history = [initial_state];

let remaining_anim_t = 0;
let turn_anim_duration = .1;

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

canvas.width = initial_state.size.x * TILE_SIZE;
canvas.height = initial_state.size.y * TILE_SIZE;

ctx.imageSmoothingEnabled = false;

// general stuff
const DIRS = {
  right: new Vec2(1, 0),
  left: new Vec2(-1, 0),
  down: new Vec2(0, 1),
  up: new Vec2(0, -1),
};

function getPressed<T extends Record<string, KeyCode[]>>(button_map: T): keyof T | null {
  for (const [action_name, buttons] of Object.entries(button_map)) {
    if (buttons.some(b => input.keyboard.wasPressed(b))) {
      return action_name;
    }
  }
  return null;
}

function cloneLevelState(old_state: LevelState): LevelState {
  return {
    size: old_state.size,
    holes: old_state.holes,
    magenta_1: {
      pos: old_state.magenta_1.pos.copyTo(),
    },
    magenta_2: {
      horizontal: old_state.magenta_2.horizontal,
      top_left: old_state.magenta_2.top_left,
      length: old_state.magenta_2.length,
      offset: old_state.magenta_2.offset,
    },
    magenta_3: {
      entry_pos: old_state.magenta_3.entry_pos.copyTo(),
      exit_pos: old_state.magenta_3.exit_pos.copyTo(),
    },
    player: {
      layer: old_state.player.layer,
      drop: old_state.player.drop,
      pos: old_state.player.pos.copyTo(),
    },
    downstairs_pos: old_state.downstairs_pos.map(x => x.copyTo()),
    max_visited_layer: old_state.max_visited_layer,
  };
}

const key_mappings = {
  "up": [KeyCode.ArrowUp, KeyCode.KeyW],
  "down": [KeyCode.ArrowDown, KeyCode.KeyS],
  "right": [KeyCode.ArrowRight, KeyCode.KeyD],
  "left": [KeyCode.ArrowLeft, KeyCode.KeyA],
};

type PlayerAction = keyof typeof key_mappings;

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

// TODO: key repeat, animation

// Our whole game logic lives inside this function
function advanceState(old_state: LevelState, player_action: PlayerAction): LevelState | null {
  let player_move = DIRS[player_action];
  let new_player_pos = old_state.player.pos.add(player_move, new Vec2());
  if (!Vec2.inBounds(new_player_pos, old_state.size)) return null;

  // go upstairs
  if (old_state.player.layer > 0 && old_state.downstairs_pos[old_state.player.layer - 1].equals(new_player_pos)) {
    let new_state = cloneLevelState(old_state);
    new_state.player.pos = new_player_pos;
    new_state.player.layer -= 1;
    new_state.player.drop = 0; // TODO: bug here
    return new_state;
  }

  // go downstairs
  if (new_player_pos.equals(old_state.downstairs_pos[old_state.player.layer])) {
    let new_state = cloneLevelState(old_state);
    new_state.player.pos = new_player_pos;
    new_state.player.layer += 1;
    new_state.player.drop = 0;
    new_state.max_visited_layer = Math.max(new_state.max_visited_layer, new_state.player.layer);
    if (new_state.player.layer >= old_state.downstairs_pos.length) {
      // TODO: END GAME
      return null;
    }
    return new_state;
  }

  let new_player_drop = findDropAt(new_player_pos, old_state.player.layer, old_state.holes);

  // TODO: interactions between mechanics
  if (old_state.max_visited_layer >= 3) {
    // mechanic 3: portal
    if (new_player_pos.equals(old_state.magenta_3.entry_pos)) {
      new_player_pos.copyFrom(old_state.magenta_3.exit_pos);
      new_player_drop = findDropAt(new_player_pos, old_state.player.layer, old_state.holes);
      let new_state = cloneLevelState(old_state);
      new_state.player.pos = new_player_pos;
      new_state.player.drop = new_player_drop;
      new_state.magenta_3.entry_pos.copyFrom(old_state.magenta_3.exit_pos);
      new_state.magenta_3.exit_pos.copyFrom(old_state.magenta_3.entry_pos);
      return new_state;
    } else if (new_player_pos.equals(old_state.magenta_3.exit_pos)) {
      let magenta_crate_drop = findDropAt(old_state.magenta_3.exit_pos, old_state.player.layer, old_state.holes);
      if (magenta_crate_drop !== old_state.player.drop || old_state.player.drop !== new_player_drop) {
        // can't stand on portal exit
        return null;
      }
      // player is pushing the crate
      let new_magenta_crate_pos = old_state.magenta_3.exit_pos.add(player_move, new Vec2());
      if (!Vec2.inBounds(new_magenta_crate_pos, old_state.size)) return null;
      let new_magenta_crate_drop = findDropAt(new_magenta_crate_pos, old_state.player.layer, old_state.holes);
      if (new_magenta_crate_drop < old_state.player.drop) return null; // player can't push the crate up
      let new_state = cloneLevelState(old_state);
      new_state.magenta_3.exit_pos = new_magenta_crate_pos;
      new_state.player.pos = new_player_pos;
      return new_state;
    }
  }

  if (old_state.max_visited_layer >= 2) {
    // mechanic 2: rail
    if (!old_state.magenta_2.horizontal) throw new Error("unimplemented");
    let old_rail_pos = new Vec2(old_state.magenta_2.offset, 0).add(old_state.magenta_2.top_left);
    if (old_state.player.pos.equals(old_rail_pos)) {
      if (player_move.y === 0) {
        let new_offset = old_state.magenta_2.offset + player_move.x;
        if (new_offset >= 0 && new_offset < old_state.magenta_2.length) {
          let new_state = cloneLevelState(old_state);
          new_state.magenta_2.offset = new_offset;
          new_state.player.pos = new_player_pos;
          new_state.player.drop = 0;
          return new_state;
        }
      }
    }
  }

  if (new_player_drop < old_state.player.drop) return null; // player can't move up

  if (old_state.max_visited_layer >= 1) {
    // mechanic 1: crate
    if (new_player_pos.equals(old_state.magenta_1.pos)) {
      // is the player pushing the crate or standing on it?
      let magenta_crate_drop = findDropAt(old_state.magenta_1.pos, old_state.player.layer, old_state.holes);
      if (magenta_crate_drop === old_state.player.drop) {
        // player is pushing the crate
        let new_magenta_crate_pos = old_state.magenta_1.pos.add(player_move, new Vec2());
        if (!Vec2.inBounds(new_magenta_crate_pos, old_state.size)) return null;
        let new_magenta_crate_drop = findDropAt(new_magenta_crate_pos, old_state.player.layer, old_state.holes);
        if (new_magenta_crate_drop < old_state.player.drop) return null; // player can't push the crate up
        let new_state = cloneLevelState(old_state);
        new_state.magenta_1.pos = new_magenta_crate_pos;
        new_state.player.pos = new_player_pos;
        return new_state;
      } else {
        // player is standing on the crate
        let new_state = cloneLevelState(old_state);
        new_state.player.pos = new_player_pos;
        new_state.player.drop = magenta_crate_drop - 1;
        return new_state;
      }
    }
  }

  let new_state = cloneLevelState(old_state);
  new_state.player.pos = new_player_pos;
  new_state.player.drop = new_player_drop;
  return new_state;

  // let magenta_crate_drop = findDropAt(old_state.magenta_crate_pos, old_state.player.layer, old_state.hole_above);
  // // if standing on the crate, add 1 height
  // if (new_player_pos.equals(old_state.magenta_crate_pos) && magenta_crate_drop )

  // if (!new_player_pos.equals(old_state.magenta_crate_pos)) {
  //   // Simple case: player moving around far from the crate
  //   new_player_drop -= 1;
  // }
  // if (new_player_drop !== old_state.player.drop) {

  // }

  // old_state.hole_above[old_state.player.layer];

  // if (new_player_pos.equals(old_state.magenta_crate_pos)) {

  // }


  // // new_state.player.pos = new_player_pos;
  // // return new_state;
  // return null;

  // if (new_state.walls.getV(new_player_pos, true)) {
  //   // bounce against wall
  //   return null;
  // } else {
  //   let pushing_crate_index = new_state.crates.findIndex(pos => Vec2.equals(pos, new_player_pos));
  //   if (pushing_crate_index === -1) {
  //     // Simply move
  //     new_state.player.copyFrom(new_player_pos);
  //     return new_state;
  //   } else {
  //     // Can the crate be pushed?
  //     let new_crate_pos = new_player_pos.add(player_move, new Vec2());
  //     if (new_state.walls.getV(new_crate_pos, true)) {
  //       // no, crate bumps against the wall
  //       return null;
  //     } else if (new_state.crates.some(pos => Vec2.equals(pos, new_crate_pos))) {
  //       // no, crate bumps against another crate
  //       return null;
  //     } else {
  //       // yes, push the crate
  //       new_state.player.copyFrom(new_player_pos);
  //       new_state.crates[pushing_crate_index].copyFrom(new_crate_pos);
  //       return new_state;
  //     }
  //   }
  // }
}

let last_timestamp = 0;
// main loop; game logic lives here
function every_frame(cur_timestamp: number) {
  // in seconds
  let delta_time = (cur_timestamp - last_timestamp) / 1000;
  last_timestamp = cur_timestamp;
  input.startFrame();

  let cur_state = at(state_history, -1);

  // undo
  if (input.keyboard.wasPressed(KeyCode.KeyZ)) {
    if (state_history.length > 1) {
      state_history.pop();
      cur_state = at(state_history, -1);
      remaining_anim_t = 0;
    }
  }

  // reset
  if (input.keyboard.wasPressed(KeyCode.KeyR)) {
    if (state_history.length > 1) {
      state_history.push(initial_state);
      remaining_anim_t = 0;
    }
  }

  // player move
  let player_action = getPressed(key_mappings);
  if (player_action !== null) {
    let new_state = advanceState(cur_state, player_action);
    if (new_state !== null) {
      state_history.push(new_state);
      cur_state = new_state;
      remaining_anim_t = 1;
    }
  }

  // animation progress
  remaining_anim_t = towards(remaining_anim_t, 0, delta_time / turn_anim_duration);

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
  let top_left_corner = Vec2.sub(pos, eye_pos).scale(scale).add(eye_pos);
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
