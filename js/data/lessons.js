// Short risk-management lessons for the Trading section. Educational only — not financial advice.

export const LESSONS = [
  {
    id: 'risk-per-trade',
    title: 'Risk a small, fixed % per trade',
    minutes: 3,
    body: [
      'Professional risk management starts with one number: how much of your account you are willing to lose if a single trade fails. Many educators suggest 0.5–1% for beginners.',
      'A fixed percentage keeps any one loss small, so a losing streak (which every strategy has) doesn’t wipe you out.',
      'With 1% risk, ten losses in a row costs about 10%. With 10% risk, the same streak costs about 65%.',
    ],
    points: ['Decide your max risk % before you trade.', 'Losing streaks are normal — size so you survive them.', 'Risk is what you lose at your stop, not the position size.'],
  },
  {
    id: 'position-size',
    title: 'Position sizing from your stop',
    minutes: 4,
    body: [
      'Your position size should come from your stop-loss distance, not from how confident you feel.',
      'Formula: Position size = (Account × Risk %) ÷ (Entry price − Stop price).',
      'Example: $1,000 account, 1% risk = $10. Entry $50, stop $48 → $2 risk per share → 5 shares.',
      'Use the calculator below to practise until it’s automatic.',
    ],
    points: ['Stop first, size second.', 'A wider stop means a smaller position.', 'Include fees/spread in practice.'],
  },
  {
    id: 'r-multiples',
    title: 'R-multiples & expectancy',
    minutes: 4,
    body: [
      '1R is the amount you risked on a trade. A trade that made twice your risk is +2R; hitting your stop is −1R.',
      'Expectancy = (Win rate × Average win in R) − (Loss rate × Average loss in R).',
      'A 40% win rate can be profitable if winners average 2R and losers 1R: 0.4×2 − 0.6×1 = +0.2R per trade.',
      'Measuring in R lets you judge a strategy independent of account size.',
    ],
    points: ['Record every result in R.', 'Win rate alone means little.', 'Positive expectancy needs a large sample to trust.'],
  },
  {
    id: 'drawdown',
    title: 'Drawdown math',
    minutes: 3,
    body: [
      'Losses and gains are not symmetric. After losing 10% you need +11% to recover; after −25% you need +33%; after −50% you need +100%.',
      'This is why protecting capital matters more than chasing big wins.',
      'Set a “circuit breaker”: e.g., pause and review after a 5% drawdown or 3 losses in a row.',
    ],
    points: ['Big losses are hard to recover from.', 'Have a pause rule.', 'Review before resuming.'],
  },
  {
    id: 'stops',
    title: 'Where stops belong',
    minutes: 3,
    body: [
      'A stop-loss should sit where your trade idea is proven wrong (invalidation), not at a random dollar amount.',
      'Never widen a stop after entry to “give it room” — that turns a planned loss into an unplanned one.',
      'Moving a stop in your favour to lock in profit is a separate, planned decision.',
    ],
    points: ['Stop = invalidation point.', 'Never move it further away.', 'Plan exits before entry.'],
  },
  {
    id: 'overtrading',
    title: 'Overtrading & revenge trading',
    minutes: 3,
    body: [
      'Revenge trading is taking impulsive trades to “win back” a loss. It is one of the fastest ways to blow up an account.',
      'Simple rules help: a maximum number of trades per day, and stopping for the day after two losses.',
      'If you feel angry, rushed or bored, journal instead of trading.',
    ],
    points: ['Cap trades per day.', 'Stop after 2 losses.', 'Emotions are data — write them down.'],
  },
  {
    id: 'backtesting',
    title: 'Backtesting honestly',
    minutes: 4,
    body: [
      'Write your rules down first, then test them on past data exactly as written.',
      'Aim for a meaningful sample (at least 30, ideally 100+ trades). Record every trade, including the ugly ones.',
      'Avoid “curve fitting” — tweaking rules until the past looks perfect. Confirm results with forward testing on a simulator before risking real money.',
    ],
    points: ['Rules first, data second.', 'Large samples only.', 'Backtest → paper trade → small real size.'],
  },
  {
    id: 'journaling',
    title: 'What to journal',
    minutes: 3,
    body: [
      'For every trade or practice trade: setup, entry, stop, target, size, risk %, result in R, whether you followed your plan, and how you felt.',
      'Screenshots before and after help you review honestly.',
      'Once a week, review: Which mistakes repeated? Which setups worked? What one rule will you improve next week?',
    ],
    points: ['Log process, not just P&L.', 'Screenshot setups.', 'Weekly review → one improvement.'],
  },
  {
    id: 'leverage',
    title: 'Leverage and margin',
    minutes: 3,
    body: [
      'Leverage lets you control a larger position with less money — and multiplies losses just as much as gains.',
      'With 10× leverage, a 10% move against you can erase your whole margin.',
      'Practise on a simulator until your process is consistent. Many beginners are best served avoiding leverage entirely.',
    ],
    points: ['Leverage multiplies losses.', 'Simulate first.', 'Your risk % rule still applies.'],
  },
  {
    id: 'news-slippage',
    title: 'News, gaps and slippage',
    minutes: 3,
    body: [
      'Prices can jump past your stop during news events, at market open, or in thin markets. That’s called slippage or a gap.',
      'Check the economic calendar before trading, and be cautious around major announcements.',
      'Assume real losses can be a bit larger than planned, and size accordingly.',
    ],
    points: ['Check the calendar.', 'Stops aren’t guaranteed.', 'Size for worst-case slippage.'],
  },
];

export const TRADE_MODES = [
  { id: 'sim', name: 'Simulated', color: '#22c3ff', desc: 'Paper / demo account practice' },
  { id: 'backtest', name: 'Backtest', color: '#c58cff', desc: 'Replay of historical data' },
  { id: 'real', name: 'Real', color: '#ff8a3d', desc: 'Real money' },
  { id: 'idea', name: 'Idea / research', color: '#9be15d', desc: 'Analysis without a trade' },
];

export const EMOTIONS = ['Calm', 'Confident', 'Focused', 'Anxious', 'Impatient', 'FOMO', 'Frustrated', 'Revenge', 'Bored', 'Greedy'];
