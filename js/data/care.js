// Face & self-care library: gentle facial relaxation, posture/neck mobility, skincare,
// dental hygiene and grooming. These reward consistency — not appearance standards.

export const CARE_SECTIONS = [
  {
    id: 'face',
    name: 'Facial relaxation',
    icon: 'smile',
    color: '#ff7ad9',
    blurb: 'Gentle movement and tension release for your face and jaw.',
    disclaimer:
      'These exercises are for relaxation and awareness. They will not reshape facial bones or permanently change your jaw. Stop if you feel pain, clicking or headaches — and skip anything that strains your jaw.',
  },
  {
    id: 'posture',
    name: 'Posture & neck',
    icon: 'posture',
    color: '#8f7dff',
    blurb: 'Slow, pain-free mobility for desk and phone posture.',
    disclaimer: 'Move slowly and only within a comfortable range. Never force your neck. Stop if you feel pain, numbness or dizziness.',
  },
  {
    id: 'skin',
    name: 'Skincare',
    icon: 'droplet',
    color: '#22c3ff',
    blurb: 'Simple morning and evening routines with your own products.',
    disclaimer: 'Keep it simple. Patch-test new products and stop anything that stings, burns or causes a rash. See a doctor or dermatologist for persistent skin issues.',
  },
  {
    id: 'dental',
    name: 'Dental hygiene',
    icon: 'tooth',
    color: '#9be15d',
    blurb: 'Two-minute brushing timers and daily flossing.',
    disclaimer: 'Use a soft brush and gentle pressure. Ask your dentist about anything that bleeds or hurts regularly.',
  },
  {
    id: 'groom',
    name: 'Grooming & hygiene',
    icon: 'shirt',
    color: '#ffb020',
    blurb: 'Showering, hair, lips, clothes and the small things.',
    disclaimer: '',
  },
];

const step = (id, name, instructions, durationSec = 0, reps = 0, extra = {}) => ({ id, name, instructions, durationSec, reps, ...extra });

export const CARE_STEPS = {
  // ----- A. Facial movements & relaxation -----
  'jaw-release': step('jaw-release', 'Jaw release massage', [
    'Sit tall. Let your teeth part slightly while your lips stay gently closed.',
    'Place your fingertips on the muscles just in front of your ears (they bulge when you clench).',
    'Massage in small, slow circles with light pressure.',
    'Then slowly open your mouth about halfway and close it, 5 times. Never open wide or force it.',
  ], 60),
  'forehead-smooth': step('forehead-smooth', 'Forehead smoothing', [
    'Place your fingertips in the middle of your forehead.',
    'Glide them outward to your temples with light pressure, as if smoothing a sheet.',
    'Repeat slowly while letting your eyebrows fully relax.',
  ], 45, 10),
  'eye-palming': step('eye-palming', 'Eye palming & blink reset', [
    'Rub your palms together until warm.',
    'Cup them over your closed eyes without pressing on the eyeballs. Breathe slowly.',
    'Remove your hands and blink slowly 10 times.',
    'Tip: during screen time, every 20 minutes look at something ~6 m (20 ft) away for 20 seconds.',
  ], 60),
  'cheek-puff': step('cheek-puff', 'Cheek puff & release', [
    'Close your lips and fill your cheeks with air.',
    'Hold for 3 seconds, then gently move the air from one cheek to the other.',
    'Release the air and let your face go completely loose.',
  ], 0, 8),
  'lip-trill': step('lip-trill', 'Lip trills', [
    'Relax your lips and blow air through them so they vibrate (like a motorboat sound).',
    'Do 3 rounds of about 10 seconds, resting between.',
    'This loosens tension around the mouth.',
  ], 45),
  'tongue-rest': step('tongue-rest', 'Resting tongue & breathing awareness', [
    'Close your lips, let your teeth rest slightly apart.',
    'Let your tongue rest lightly against the roof of your mouth — no pushing or pressing.',
    'Breathe slowly through your nose for one minute, noticing any jaw clenching and letting it go.',
  ], 60),
  'face-scan': step('face-scan', 'Face relaxation scan', [
    'Close your eyes and take a slow breath in for 4 seconds, out for 6 seconds.',
    'On each out-breath, release one area: forehead, eyes, cheeks, jaw, tongue, shoulders.',
    'Finish with three slow breaths.',
  ], 90),

  // ----- B. Posture & neck mobility -----
  'chin-tuck': step('chin-tuck', 'Chin tucks', [
    'Sit or stand tall, eyes looking forward.',
    'Gently glide your head straight back (like making a slight double chin) — don’t tilt down.',
    'Hold 3 seconds, then release. Keep it gentle.',
  ], 0, 10),
  'neck-side': step('neck-side', 'Neck side stretch', [
    'Sit tall with shoulders relaxed.',
    'Slowly tilt your ear toward your shoulder until you feel a light stretch. No pulling.',
    'Hold 20 seconds, breathe, return to center slowly, then switch sides.',
  ], 50),
  'neck-turn': step('neck-turn', 'Slow neck turns', [
    'Sit tall. Slowly turn your head to look over one shoulder within a comfortable range.',
    'Pause, return to center, then turn the other way.',
    '5 slow turns each side. No bouncing.',
  ], 0, 10),
  'shoulder-roll': step('shoulder-roll', 'Shoulder rolls', [
    'Lift your shoulders up toward your ears, roll them back and down.',
    'Make big, slow circles. 10 backward rolls.',
  ], 0, 10),
  'scap-squeeze': step('scap-squeeze', 'Shoulder blade squeeze', [
    'Sit or stand tall with arms relaxed.',
    'Squeeze your shoulder blades back and down (not up toward your ears).',
    'Hold 3 seconds and release.',
  ], 0, 12),
  'wall-angel': step('wall-angel', 'Wall angels', [
    'Stand with your back against a wall, feet a little forward.',
    'Raise your arms into a “goalpost” shape against the wall (go only as far as comfortable).',
    'Slowly slide your arms up and back down, keeping your back against the wall.',
  ], 0, 8),
  'doorway-stretch': step('doorway-stretch', 'Doorway chest stretch', [
    'Place your forearms on either side of a doorway, elbows at shoulder height.',
    'Step one foot through gently until you feel a stretch across your chest.',
    'Hold 30 seconds, breathe, step back. Repeat once more.',
  ], 60),
  'thoracic-chair': step('thoracic-chair', 'Upper-back extension over chair', [
    'Sit in a chair whose backrest reaches your mid-back.',
    'Put your hands behind your head, elbows forward.',
    'Gently lean back over the backrest to open your upper back, then return. Keep your neck relaxed.',
  ], 0, 8),

  // ----- C. Skincare -----
  'cleanse-am': step('cleanse-am', 'Gentle cleanse (or water rinse)', [
    'Use lukewarm water and a gentle, fragrance-free cleanser — or just water if your skin is dry or sensitive.',
    'Massage for about 30–60 seconds, rinse and pat dry with a clean towel.',
  ], 60),
  'moisturize': step('moisturize', 'Moisturize', [
    'Apply a pea-to-nickel-sized amount of moisturizer to face and neck.',
    'Choose lighter gel textures for oily skin and richer creams for dry skin.',
  ], 30),
  'sunscreen': step('sunscreen', 'Sunscreen (SPF 30+, broad-spectrum)', [
    'Apply as the last morning step: about two finger-lengths for face and neck.',
    'Don’t forget ears and the back of your neck.',
    'Reapply every 2 hours when outside, and after sweating or swimming.',
  ], 45),
  'cleanse-pm': step('cleanse-pm', 'Evening cleanse', [
    'Wash away sunscreen, sweat and dirt with a gentle cleanser and lukewarm water.',
    'Massage 60 seconds, rinse, pat dry. Avoid scrubbing hard.',
  ], 60),

  // ----- D. Dental -----
  brush: step('brush', 'Brush for 2 minutes', [
    'Use a soft-bristled brush and a pea-sized amount of fluoride toothpaste.',
    'Angle bristles toward the gumline at about 45° and use small gentle circles.',
    'Spend 30 seconds on each quarter of your mouth — the timer will prompt you.',
    'Spit, but don’t rinse with lots of water, so the fluoride keeps working.',
  ], 120, 0, { prompts: ['Upper right — outside, inside, chewing surfaces', 'Upper left', 'Lower left', 'Lower right'] }),
  floss: step('floss', 'Floss', [
    'Use about 45 cm (18 in) of floss, wound around your middle fingers.',
    'Slide gently between each pair of teeth and curve it into a C shape around each tooth.',
    'Move up and down under the gumline gently. Use a clean section for each gap.',
  ], 120),
  tongue: step('tongue', 'Clean your tongue', ['Gently brush or scrape your tongue from back to front a few times.', 'Rinse the brush/scraper.'], 20),

  // ----- E. Grooming -----
  shower: step('shower', 'Shower', ['Shower with lukewarm water (very hot water dries skin).', 'Wash armpits, groin, feet and behind ears.', 'Dry thoroughly, especially between toes.'], 480),
  deodorant: step('deodorant', 'Deodorant', ['Apply to clean, dry underarms.'], 15),
  hair: step('hair', 'Hair care', ['Wash or rinse according to your hair type (daily isn’t required for everyone).', 'Condition the lengths, then style or brush.'], 180),
  lips: step('lips', 'Lip balm', ['Apply a plain lip balm (with SPF during the day if you’ll be outside).'], 10),
  clothes: step('clothes', 'Clean clothes ready', ['Put on clean clothes and socks.', 'Lay out tomorrow’s outfit tonight to save time.'], 120),
  nails: step('nails', 'Nail check', ['Trim and clean fingernails and toenails (about weekly).', 'Cut toenails straight across.'], 300),
  shave: step('shave', 'Shave / beard trim', ['Use a clean, sharp razor or trimmer.', 'Shave with the grain to reduce irritation; rinse with cool water.'], 300),
  'face-wash-post': step('face-wash-post', 'Rinse face after workout', ['Rinse your face with water or gentle cleanser after sweating.'], 30),
};

export const CARE_ROUTINE_TEMPLATES = [
  { key: 'face-relax', section: 'face', name: 'Face relaxation', slot: 'any', time: '20:30', steps: ['face-scan', 'jaw-release', 'forehead-smooth', 'eye-palming', 'cheek-puff', 'lip-trill', 'tongue-rest'] },
  { key: 'posture-reset', section: 'posture', name: 'Posture reset', slot: 'any', time: '16:00', steps: ['chin-tuck', 'shoulder-roll', 'scap-squeeze', 'neck-side', 'neck-turn', 'wall-angel', 'doorway-stretch', 'thoracic-chair'] },
  { key: 'skin-am', section: 'skin', name: 'Morning skincare', slot: 'am', steps: ['cleanse-am', 'moisturize', 'sunscreen'] },
  { key: 'skin-pm', section: 'skin', name: 'Evening skincare', slot: 'pm', steps: ['cleanse-pm', 'moisturize'] },
  { key: 'dental-am', section: 'dental', name: 'Morning brush', slot: 'am', steps: ['brush'] },
  { key: 'dental-pm', section: 'dental', name: 'Night brush & floss', slot: 'pm', steps: ['floss', 'brush', 'tongue'] },
  { key: 'groom-daily', section: 'groom', name: 'Daily grooming', slot: 'am', steps: ['shower', 'deodorant', 'hair', 'lips', 'clothes'] },
  { key: 'groom-weekly', section: 'groom', name: 'Weekly grooming', slot: 'any', steps: ['nails', 'shave'], weekly: true },
];

export const SKIN_TYPES = [
  { id: 'normal', name: 'Normal' },
  { id: 'oily', name: 'Oily' },
  { id: 'dry', name: 'Dry' },
  { id: 'combination', name: 'Combination' },
  { id: 'sensitive', name: 'Sensitive' },
  { id: 'unsure', name: 'Not sure' },
];

export const COMMON_SENSITIVITIES = ['Fragrance', 'Essential oils', 'Alcohol (drying)', 'Retinoids', 'AHA/BHA acids', 'Benzoyl peroxide', 'Lanolin', 'Nickel'];

export function careStepMinutes(steps) {
  const sec = steps.reduce((s, x) => s + (x.durationSec || (x.reps ? x.reps * 5 : 30)), 0);
  return Math.max(1, Math.round(sec / 60));
}
