// Exercise library + starter routines. Instructions are written for safe, gradual progression.
// equipment: none | bar (pull-up bar) | dumbbells | bands | bench | gym

export const EQUIPMENT = [
  { id: 'none', name: 'No equipment' },
  { id: 'bar', name: 'Pull-up bar' },
  { id: 'dumbbells', name: 'Dumbbells' },
  { id: 'bands', name: 'Resistance bands' },
  { id: 'bench', name: 'Bench / sturdy chair' },
  { id: 'gym', name: 'Full gym' },
];

export const MUSCLES = {
  chest: 'Chest',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  abs: 'Abs',
  obliques: 'Obliques',
  back: 'Upper back / lats',
  traps: 'Traps',
  lowerback: 'Lower back',
  glutes: 'Glutes',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  calves: 'Calves',
};

const E = (id, name, pattern, equipment, level, muscles, secondary, unit, instructions, extra = {}) => ({
  id,
  name,
  pattern,
  equipment,
  level,
  muscles,
  secondary,
  unit,
  instructions,
  ...extra,
});

export const EXERCISES = [
  // ---------- push ----------
  E('wall-pushup', 'Wall push-up', 'push', 'none', 1, ['chest'], ['triceps', 'shoulders'], 'reps', [
    'Stand an arm’s length from a wall, hands on it at shoulder height and a bit wider than shoulders.',
    'Keep your body in one straight line from head to heels.',
    'Bend your elbows to bring your chest toward the wall, elbows angled about 45° from your body.',
    'Push back to straight arms. Breathe out as you push.',
  ], { harder: 'incline-pushup' }),
  E('incline-pushup', 'Incline push-up', 'push', 'none', 1, ['chest'], ['triceps', 'shoulders'], 'reps', [
    'Place hands on a sturdy counter, desk or step (higher = easier).',
    'Walk your feet back until your body is straight and braced, like a plank.',
    'Lower your chest to the edge with control, elbows about 45° from your sides.',
    'Press back up without letting your hips sag.',
  ], { easier: 'wall-pushup', harder: 'knee-pushup' }),
  E('knee-pushup', 'Knee push-up', 'push', 'none', 1, ['chest'], ['triceps', 'shoulders'], 'reps', [
    'Start on hands and knees, then walk hands forward so your body is straight from knees to head.',
    'Hands slightly wider than shoulders, fingers forward.',
    'Lower until your chest is a fist’s height from the floor.',
    'Push the floor away to return. Keep your core tight the whole time.',
  ], { easier: 'incline-pushup', harder: 'pushup' }),
  E('pushup', 'Push-up', 'push', 'none', 2, ['chest'], ['triceps', 'shoulders', 'abs'], 'reps', [
    'Hands under shoulders (slightly wider), legs straight, squeeze glutes and brace your stomach.',
    'Lower as one unit until your chest is close to the floor; elbows travel back at about 45°.',
    'Pause briefly, then press up to fully straight arms.',
    'If form breaks (hips sag or pike), finish the set on your knees.',
  ], { easier: 'knee-pushup', harder: 'diamond-pushup', safety: 'Stop if you feel wrist, elbow or shoulder pain. Try fists or push-up handles for wrist comfort.' }),
  E('diamond-pushup', 'Close-grip push-up', 'push', 'none', 3, ['triceps'], ['chest', 'shoulders'], 'reps', [
    'Set up like a push-up with hands closer together, under your chest.',
    'Keep elbows close to your ribs as you lower.',
    'Press back up, focusing on straightening the arms.',
  ], { easier: 'pushup', harder: 'decline-pushup' }),
  E('decline-pushup', 'Decline push-up', 'push', 'bench', 3, ['chest', 'shoulders'], ['triceps'], 'reps', [
    'Feet on a sturdy chair or step, hands on the floor.',
    'Brace your core so your lower back doesn’t sag.',
    'Lower your chest under control, then press back up.',
  ], { easier: 'pushup' }),
  E('pike-pushup', 'Pike push-up', 'push', 'none', 2, ['shoulders'], ['triceps', 'traps'], 'reps', [
    'Start in a downward-dog shape: hips high, hands shoulder-width, legs as straight as comfortable.',
    'Bend your elbows to lower the top of your head toward the floor between your hands.',
    'Press back up. Move slowly and keep your neck neutral.',
  ], { easier: 'pushup' }),
  E('bench-dip', 'Chair dip', 'push', 'bench', 2, ['triceps'], ['chest', 'shoulders'], 'reps', [
    'Sit on the edge of a sturdy, non-rolling chair; hands beside hips, fingers forward.',
    'Slide your hips off the seat with knees bent and feet flat.',
    'Bend elbows straight back to lower a short distance (stop when upper arms are about parallel to the floor).',
    'Press back up. Keep shoulders down away from ears.',
  ], { safety: 'Skip if it causes shoulder pain. Keep the range small at first.' }),
  E('db-bench', 'Dumbbell floor/bench press', 'push', 'dumbbells', 2, ['chest'], ['triceps', 'shoulders'], 'reps', [
    'Lie on a bench or the floor holding dumbbells over your chest, palms facing your feet.',
    'Lower the weights slowly until elbows are slightly below the bench (or touch the floor).',
    'Press up and slightly together. Keep feet planted.',
  ]),
  E('db-shoulder-press', 'Dumbbell shoulder press', 'push', 'dumbbells', 2, ['shoulders'], ['triceps', 'traps'], 'reps', [
    'Stand or sit tall with dumbbells at shoulder height, palms forward.',
    'Brace your core and press overhead without arching your lower back.',
    'Lower with control back to shoulder height.',
  ]),
  E('db-lateral-raise', 'Lateral raise', 'push', 'dumbbells', 1, ['shoulders'], [], 'reps', [
    'Stand tall with light dumbbells at your sides, slight bend in the elbows.',
    'Raise arms out to the sides until they reach shoulder height.',
    'Lower slowly. Use light weight and no swinging.',
  ]),
  E('db-tricep-ext', 'Overhead triceps extension', 'push', 'dumbbells', 1, ['triceps'], [], 'reps', [
    'Hold one dumbbell overhead with both hands.',
    'Bend at the elbows to lower it behind your head, upper arms staying still.',
    'Straighten the arms to lift it back up.',
  ]),
  E('band-chest-press', 'Band chest press', 'push', 'bands', 1, ['chest'], ['triceps', 'shoulders'], 'reps', [
    'Anchor a band behind you at chest height (or wrap it around your upper back).',
    'Hold the handles at chest level, step forward for tension.',
    'Press straight forward, then return slowly.',
  ]),
  E('barbell-bench', 'Barbell bench press', 'push', 'gym', 2, ['chest'], ['triceps', 'shoulders'], 'reps', [
    'Lie on the bench with eyes under the bar, feet planted, shoulder blades squeezed together.',
    'Grip slightly wider than shoulders. Unrack and lower the bar to mid-chest with control.',
    'Press up to straight arms. Always use safety pins or a spotter for heavy sets.',
  ]),
  E('overhead-press', 'Barbell overhead press', 'push', 'gym', 2, ['shoulders'], ['triceps', 'traps', 'abs'], 'reps', [
    'Bar at collarbone height, grip just outside shoulders, glutes and core tight.',
    'Press straight up, moving your head back slightly so the bar passes your face.',
    'Finish with the bar over your mid-foot, then lower with control.',
  ]),

  // ---------- pull ----------
  E('superman', 'Superman hold', 'pull', 'none', 1, ['lowerback'], ['glutes', 'back'], 'sec', [
    'Lie face down with arms stretched in front.',
    'Gently lift arms, chest and legs a few centimetres off the floor; look at the floor to keep your neck neutral.',
    'Hold, breathing steadily, then lower.',
  ]),
  E('snow-angel', 'Prone snow angel', 'pull', 'none', 1, ['back'], ['shoulders', 'traps'], 'reps', [
    'Lie face down, forehead resting on a towel, arms by your sides, palms down.',
    'Lift your arms slightly and sweep them overhead in an arc, like a snow angel.',
    'Sweep back to your sides. Move slowly and keep the arms off the floor.',
  ]),
  E('towel-row', 'Doorway towel row', 'pull', 'none', 2, ['back'], ['biceps', 'forearms'], 'reps', [
    'Loop a strong towel around a solid door handle on a door that is CLOSED and opens away from you (or around a sturdy post).',
    'Hold both ends, walk your feet close to the door and lean back with straight arms.',
    'Pull your chest toward your hands, squeezing your shoulder blades, then lower slowly.',
    'Lean back less to make it easier.',
  ], { safety: 'Only use a door that is closed and cannot swing toward you. Test it with light pressure first.' }),
  E('band-row', 'Band row', 'pull', 'bands', 1, ['back'], ['biceps'], 'reps', [
    'Anchor a band at chest height or loop it around your feet while seated.',
    'Pull the handles to your ribs, squeezing your shoulder blades together.',
    'Return slowly with straight arms.',
  ]),
  E('db-row', 'One-arm dumbbell row', 'pull', 'dumbbells', 1, ['back'], ['biceps', 'forearms'], 'reps', [
    'Place one hand and knee on a bench (or hand on a chair), back flat.',
    'Hold a dumbbell under your shoulder with the other hand.',
    'Pull it toward your hip, keeping your elbow close. Lower slowly. Repeat on the other side.',
  ]),
  E('db-curl', 'Dumbbell curl', 'pull', 'dumbbells', 1, ['biceps'], ['forearms'], 'reps', [
    'Stand tall with dumbbells at your sides, palms forward.',
    'Curl the weights up without swinging your body.',
    'Lower slowly to fully straight arms.',
  ]),
  E('band-curl', 'Band curl', 'pull', 'bands', 1, ['biceps'], ['forearms'], 'reps', [
    'Stand on the middle of a band, holding the ends.',
    'Curl your hands toward your shoulders, elbows at your sides.',
    'Lower slowly.',
  ]),
  E('dead-hang', 'Dead hang', 'pull', 'bar', 1, ['forearms'], ['back', 'shoulders'], 'sec', [
    'Grab the bar with an overhand grip, shoulder-width.',
    'Hang with arms straight. Keep shoulders slightly engaged (not shrugged up to ears).',
    'Step down safely when your grip starts to fail.',
  ], { harder: 'negative-pullup' }),
  E('australian-row', 'Inverted row (low bar)', 'pull', 'bar', 1, ['back'], ['biceps'], 'reps', [
    'Set a bar at waist height in a sturdy rack or use a low bar.',
    'Hang underneath with straight arms and your body straight, heels on the floor.',
    'Pull your chest to the bar, then lower with control. Bend your knees to make it easier.',
  ]),
  E('negative-pullup', 'Negative pull-up', 'pull', 'bar', 2, ['back'], ['biceps', 'forearms'], 'reps', [
    'Use a step to get your chin above the bar.',
    'Lift your feet and lower yourself as slowly as you can (aim for 3–5 seconds).',
    'Step back up and repeat. This builds strength for full pull-ups.',
  ], { easier: 'dead-hang', harder: 'pullup' }),
  E('pullup', 'Pull-up', 'pull', 'bar', 3, ['back'], ['biceps', 'forearms', 'abs'], 'reps', [
    'Hang from the bar with an overhand grip slightly wider than shoulders.',
    'Pull your chest toward the bar until your chin clears it.',
    'Lower all the way down with control. No kicking or swinging.',
  ], { easier: 'negative-pullup' }),
  E('chinup', 'Chin-up', 'pull', 'bar', 3, ['back', 'biceps'], ['forearms'], 'reps', [
    'Hang with an underhand grip, hands shoulder-width.',
    'Pull until your chin clears the bar.',
    'Lower slowly to straight arms.',
  ], { easier: 'negative-pullup' }),
  E('lat-pulldown', 'Lat pulldown', 'pull', 'gym', 1, ['back'], ['biceps'], 'reps', [
    'Sit with thighs under the pad, grip the bar slightly wider than shoulders.',
    'Pull the bar to your upper chest while leaning back slightly.',
    'Return slowly until arms are straight.',
  ]),
  E('cable-row', 'Seated cable row', 'pull', 'gym', 1, ['back'], ['biceps', 'traps'], 'reps', [
    'Sit tall with a slight knee bend, holding the handle.',
    'Row it to your stomach, squeezing shoulder blades together.',
    'Extend arms slowly without rounding your back.',
  ]),

  // ---------- legs ----------
  E('squat', 'Bodyweight squat', 'legs', 'none', 1, ['quads', 'glutes'], ['hamstrings', 'abs'], 'reps', [
    'Feet about shoulder-width, toes slightly out.',
    'Sit your hips back and down as if onto a chair, chest up, knees following your toes.',
    'Go as low as is comfortable with heels on the floor, then stand up by pushing through your whole foot.',
  ], { harder: 'split-squat' }),
  E('box-squat', 'Sit-to-stand', 'legs', 'bench', 1, ['quads', 'glutes'], [], 'reps', [
    'Stand in front of a sturdy chair.',
    'Lower slowly until you lightly touch the seat, then stand back up without using your hands.',
  ], { harder: 'squat' }),
  E('reverse-lunge', 'Reverse lunge', 'legs', 'none', 1, ['quads', 'glutes'], ['hamstrings'], 'reps', [
    'Stand tall, step one foot back and lower until both knees are bent about 90°.',
    'Keep your front heel down and torso upright.',
    'Push through the front foot to return. Count reps per leg.',
  ]),
  E('split-squat', 'Split squat', 'legs', 'none', 2, ['quads', 'glutes'], ['hamstrings'], 'reps', [
    'Take a long stance, one foot forward and one back.',
    'Lower your back knee toward the floor, then rise. Keep weight mostly in the front foot.',
    'Finish all reps on one side, then switch.',
  ], { easier: 'reverse-lunge', harder: 'bulgarian' }),
  E('bulgarian', 'Bulgarian split squat', 'legs', 'bench', 3, ['quads', 'glutes'], ['hamstrings'], 'reps', [
    'Stand in front of a bench/chair and rest the top of your back foot on it.',
    'Lower your hips straight down until your front thigh is near parallel.',
    'Drive up through your front foot. Hold a wall for balance if needed.',
  ], { easier: 'split-squat' }),
  E('glute-bridge', 'Glute bridge', 'legs', 'none', 1, ['glutes'], ['hamstrings', 'lowerback'], 'reps', [
    'Lie on your back, knees bent, feet flat and hip-width.',
    'Squeeze your glutes and lift your hips until body is straight from shoulders to knees.',
    'Pause for a second, then lower slowly. Avoid arching your lower back.',
  ], { harder: 'single-leg-bridge' }),
  E('single-leg-bridge', 'Single-leg glute bridge', 'legs', 'none', 2, ['glutes'], ['hamstrings'], 'reps', [
    'Set up like a glute bridge, then lift one foot off the floor.',
    'Drive through the planted heel to lift your hips level.',
    'Lower with control. Do all reps, then switch legs.',
  ], { easier: 'glute-bridge' }),
  E('wall-sit', 'Wall sit', 'legs', 'none', 1, ['quads'], ['glutes'], 'sec', [
    'Lean your back against a wall and slide down until knees are bent (aim for about 90°, higher is fine).',
    'Keep knees over ankles and breathe steadily.',
    'Hold for the time, then slide up.',
  ]),
  E('step-up', 'Step-up', 'legs', 'bench', 1, ['quads', 'glutes'], ['calves'], 'reps', [
    'Face a sturdy step or low bench.',
    'Step up with one foot, pressing through the heel to stand fully on top.',
    'Step down with control. Alternate or do one side at a time.',
  ]),
  E('calf-raise', 'Calf raise', 'legs', 'none', 1, ['calves'], [], 'reps', [
    'Stand tall, hold a wall for balance.',
    'Rise onto the balls of your feet as high as you can.',
    'Lower slowly. Do them on a step edge for more range.',
  ]),
  E('goblet-squat', 'Goblet squat', 'legs', 'dumbbells', 1, ['quads', 'glutes'], ['abs'], 'reps', [
    'Hold one dumbbell vertically against your chest.',
    'Squat down between your knees, elbows inside knees, chest tall.',
    'Stand back up through your whole foot.',
  ]),
  E('db-rdl', 'Dumbbell Romanian deadlift', 'legs', 'dumbbells', 2, ['hamstrings', 'glutes'], ['lowerback', 'forearms'], 'reps', [
    'Stand with dumbbells in front of your thighs, knees softly bent.',
    'Push your hips back and slide the weights down your legs, keeping your back flat.',
    'Stop when you feel a strong hamstring stretch, then drive hips forward to stand.',
  ], { safety: 'Keep your back neutral. Use lighter weight if your lower back rounds.' }),
  E('back-squat', 'Barbell back squat', 'legs', 'gym', 2, ['quads', 'glutes'], ['hamstrings', 'abs', 'lowerback'], 'reps', [
    'Set the bar on your upper back in a squat rack with safety bars at the right height.',
    'Brace, sit down and back until thighs reach about parallel (or your comfortable depth).',
    'Drive up keeping your chest proud. Learn the movement with light weight first.',
  ]),
  E('leg-press', 'Leg press', 'legs', 'gym', 1, ['quads', 'glutes'], ['hamstrings'], 'reps', [
    'Feet shoulder-width on the platform, lower back pressed into the seat.',
    'Lower the platform until knees are bent around 90°.',
    'Press back up without locking your knees hard.',
  ]),

  // ---------- core ----------
  E('plank', 'Plank', 'core', 'none', 1, ['abs'], ['shoulders', 'glutes'], 'sec', [
    'Forearms on the floor under your shoulders, legs straight behind you.',
    'Squeeze glutes, brace your stomach, keep a straight line from head to heels.',
    'Breathe normally. Drop to your knees if your hips sag.',
  ]),
  E('side-plank', 'Side plank', 'core', 'none', 2, ['obliques'], ['abs', 'shoulders'], 'sec', [
    'Lie on your side, elbow under your shoulder.',
    'Lift your hips so your body is straight. Bend the bottom knee to make it easier.',
    'Hold, then switch sides.',
  ]),
  E('dead-bug', 'Dead bug', 'core', 'none', 1, ['abs'], [], 'reps', [
    'Lie on your back, arms pointing at the ceiling, knees bent at 90° over hips.',
    'Press your lower back gently into the floor.',
    'Slowly extend the opposite arm and leg, return, and switch sides. Count each side as one rep.',
  ]),
  E('bird-dog', 'Bird dog', 'core', 'none', 1, ['lowerback', 'abs'], ['glutes', 'shoulders'], 'reps', [
    'Start on hands and knees, back flat.',
    'Reach one arm forward and the opposite leg back until both are level with your body.',
    'Hold for 2 seconds without twisting, return, and switch.',
  ]),
  E('crunch', 'Crunch', 'core', 'none', 1, ['abs'], [], 'reps', [
    'Lie on your back, knees bent, hands lightly beside your head (don’t pull on your neck).',
    'Curl your shoulders off the floor by tightening your stomach.',
    'Lower slowly.',
  ], { harder: 'situp' }),
  E('situp', 'Sit-up', 'core', 'none', 2, ['abs'], ['obliques'], 'reps', [
    'Lie on your back, knees bent, feet flat (anchor feet under something if needed).',
    'Cross arms over your chest. Curl up until your chest approaches your thighs.',
    'Lower down with control, one vertebra at a time.',
  ], { easier: 'crunch', safety: 'Stop if you feel lower-back or neck pain; do crunches or dead bugs instead.' }),
  E('hollow-hold', 'Hollow hold', 'core', 'none', 2, ['abs'], [], 'sec', [
    'Lie on your back, press your lower back into the floor.',
    'Lift shoulders and legs slightly off the floor, arms by your ears (or by your sides to make it easier).',
    'Hold while keeping your lower back down.',
  ]),
  E('leg-raise', 'Lying leg raise', 'core', 'none', 2, ['abs'], [], 'reps', [
    'Lie on your back, hands under your hips, legs straight.',
    'Raise legs to vertical, keeping your lower back on the floor.',
    'Lower slowly. Bend knees to make it easier.',
  ]),
  E('mountain-climber', 'Mountain climber', 'core', 'none', 1, ['abs'], ['shoulders', 'quads'], 'sec', [
    'Start in a high plank.',
    'Drive one knee toward your chest, then switch legs in a steady rhythm.',
    'Keep hips level and shoulders over hands.',
  ]),

  // ---------- mobility / recovery ----------
  E('cat-cow', 'Cat–cow', 'mobility', 'none', 1, ['lowerback'], ['back'], 'reps', [
    'On hands and knees, breathe in as you let your belly drop and lift your chest (cow).',
    'Breathe out as you round your back toward the ceiling (cat).',
    'Move slowly and smoothly through a comfortable range.',
  ]),
  E('hip-flexor', 'Kneeling hip flexor stretch', 'mobility', 'none', 1, ['quads'], ['glutes'], 'sec', [
    'Kneel on one knee (use a pillow), other foot forward.',
    'Squeeze the glute of the back leg and shift your hips gently forward until you feel a stretch at the front of the hip.',
    'Hold, breathe, then switch sides.',
  ]),
  E('hamstring-stretch', 'Hamstring stretch', 'mobility', 'none', 1, ['hamstrings'], [], 'sec', [
    'Sit with one leg straight and the other bent.',
    'Hinge forward from the hips with a long back until you feel a gentle stretch.',
    'Hold and breathe. Switch legs.',
  ]),
  E('childs-pose', 'Child’s pose', 'mobility', 'none', 1, ['lowerback'], ['back'], 'sec', [
    'Kneel, sit your hips toward your heels and reach your arms forward on the floor.',
    'Let your forehead rest down and breathe slowly into your back.',
  ]),
  E('thoracic-rotation', 'Open book rotation', 'mobility', 'none', 1, ['back'], ['chest'], 'reps', [
    'Lie on your side, knees bent, arms straight in front together.',
    'Open the top arm like a book, rotating your upper back while knees stay stacked.',
    'Return slowly. Do all reps, then switch sides.',
  ]),
  E('worlds-greatest', 'Lunge with reach', 'mobility', 'none', 1, ['quads', 'glutes'], ['back', 'hamstrings'], 'reps', [
    'Step into a long lunge and place both hands inside your front foot.',
    'Rotate and reach the arm on the front-leg side toward the ceiling.',
    'Return and step back. Alternate sides.',
  ]),

  // ---------- cardio ----------
  E('jumping-jacks', 'Jumping jacks', 'cardio', 'none', 1, ['calves'], ['shoulders', 'quads'], 'sec', [
    'Jump feet out while raising arms overhead, then jump back together.',
    'Land softly. Step side to side instead of jumping for a low-impact version.',
  ]),
  E('high-knees', 'High knees', 'cardio', 'none', 1, ['quads'], ['abs', 'calves'], 'sec', [
    'Jog in place, driving knees toward hip height.',
    'Stay light on the balls of your feet and pump your arms.',
  ]),
  E('burpee', 'Burpee', 'cardio', 'none', 2, ['chest', 'quads'], ['abs', 'shoulders'], 'reps', [
    'From standing, squat and place hands on the floor.',
    'Step or jump feet back to a plank, then bring them back in.',
    'Stand up (add a small jump if you like). Step instead of jumping to make it easier.',
  ]),
  E('brisk-walk', 'Brisk walk', 'cardio', 'none', 1, ['calves'], ['quads', 'glutes'], 'sec', [
    'Walk at a pace where you can talk but not sing.',
    'Stand tall, swing your arms naturally.',
  ]),
];

export const EX = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));

export function exerciseById(state, id) {
  return EX[id] || (state && state.fitness.customExercises.find((e) => e.id === id)) || null;
}

export function allExercises(state) {
  return [...EXERCISES, ...((state && state.fitness.customExercises) || [])];
}

/** Can this exercise be done with the user's equipment? */
export function available(ex, equipment) {
  const eq = new Set(equipment && equipment.length ? equipment : ['none']);
  if (ex.equipment === 'none') return true;
  if (eq.has('gym')) return true;
  if (ex.equipment === 'bench') return true; // a sturdy chair works
  return eq.has(ex.equipment);
}

const S = (exId, sets, reps, restSec = 60) => ({ exId, sets, reps, restSec });

/** Starter routines, chosen by experience and equipment. */
export function routineTemplates(experience = 'beginner', equipment = ['none']) {
  const eq = new Set(equipment);
  const lvl = experience === 'none' || experience === 'beginner' ? 1 : experience === 'intermediate' ? 2 : 3;
  const out = [];
  if (lvl === 1) {
    out.push({
      key: 'foundation-a',
      name: 'Foundations A — Full Body',
      exercises: [S('incline-pushup', 3, 8), S('squat', 3, 10), S('glute-bridge', 3, 12), S('snow-angel', 2, 8), S('plank', 3, 20, 45), S('dead-bug', 2, 8, 45)],
    });
    out.push({
      key: 'foundation-b',
      name: 'Foundations B — Full Body',
      exercises: [S('knee-pushup', 3, 6), S('reverse-lunge', 3, 6), S('superman', 3, 15, 45), S('calf-raise', 2, 12, 45), S('bird-dog', 2, 8, 45), S('side-plank', 2, 15, 45)],
    });
  } else {
    out.push({
      key: 'bw-upper',
      name: 'Bodyweight Upper',
      exercises: [S('pushup', 4, lvl === 3 ? 15 : 10, 75), S('pike-pushup', 3, 8, 75), S('bench-dip', 3, 10), S(eq.has('bar') ? 'australian-row' : 'towel-row', 3, 10), S('hollow-hold', 3, 25, 45)],
    });
    out.push({
      key: 'bw-lower',
      name: 'Bodyweight Lower + Core',
      exercises: [S(lvl === 3 ? 'bulgarian' : 'split-squat', 3, 10, 75), S('single-leg-bridge', 3, 10), S('wall-sit', 3, 40), S('calf-raise', 3, 15, 45), S('situp', 3, 15, 45), S('side-plank', 2, 30, 45)],
    });
  }
  if (eq.has('bar')) {
    out.push({
      key: 'bar-pull',
      name: 'Pull-up Bar Day',
      exercises: lvl === 1 ? [S('dead-hang', 3, 20, 60), S('australian-row', 3, 8), S('negative-pullup', 3, 3, 90), S('superman', 2, 20, 45)] : [S('pullup', 4, lvl === 3 ? 8 : 5, 120), S('chinup', 3, 5, 120), S('australian-row', 3, 10), S('dead-hang', 2, 30, 60)],
    });
  }
  if (eq.has('dumbbells')) {
    out.push({
      key: 'db-upper',
      name: 'Dumbbell Upper',
      exercises: [S('db-bench', 3, 10, 90), S('db-row', 3, 10, 75), S('db-shoulder-press', 3, 10, 75), S('db-curl', 2, 12), S('db-tricep-ext', 2, 12)],
    });
    out.push({
      key: 'db-lower',
      name: 'Dumbbell Lower',
      exercises: [S('goblet-squat', 3, 10, 90), S('db-rdl', 3, 10, 90), S('reverse-lunge', 3, 8, 75), S('calf-raise', 3, 15, 45), S('plank', 3, 30, 45)],
    });
  }
  if (eq.has('bands') && !eq.has('dumbbells')) {
    out.push({
      key: 'band-upper',
      name: 'Band Upper',
      exercises: [S('band-chest-press', 3, 12), S('band-row', 3, 12), S('band-curl', 2, 12), S('pushup', 2, 8), S('dead-bug', 2, 10, 45)],
    });
  }
  if (eq.has('gym')) {
    out.push({ key: 'gym-push', name: 'Gym Push', exercises: [S('barbell-bench', 4, 8, 120), S('overhead-press', 3, 8, 120), S('db-lateral-raise', 3, 12), S('db-tricep-ext', 3, 12)] });
    out.push({ key: 'gym-pull', name: 'Gym Pull', exercises: [S('lat-pulldown', 4, 10, 90), S('cable-row', 3, 10, 90), S('db-curl', 3, 12), S('dead-hang', 2, 30)] });
    out.push({ key: 'gym-legs', name: 'Gym Legs', exercises: [S('back-squat', 4, 8, 150), S('db-rdl', 3, 10, 120), S('leg-press', 3, 12, 90), S('calf-raise', 3, 15, 45)] });
  }
  out.push({
    key: 'recovery',
    name: 'Recovery & Mobility',
    recovery: true,
    exercises: [S('cat-cow', 1, 10, 15), S('hip-flexor', 2, 30, 15), S('hamstring-stretch', 2, 30, 15), S('thoracic-rotation', 1, 8, 15), S('childs-pose', 1, 45, 15), S('brisk-walk', 1, 900, 0)],
  });
  return out;
}

/** Rough minutes for a routine (work + rest). */
export function routineMinutes(state, routine) {
  let sec = 0;
  for (const it of routine.exercises || []) {
    const ex = exerciseById(state, it.exId);
    const work = ex && ex.unit === 'sec' ? it.reps : it.reps * 3;
    sec += it.sets * (work + (it.restSec ?? 60)) + 20;
  }
  return Math.max(5, Math.round(sec / 60));
}
