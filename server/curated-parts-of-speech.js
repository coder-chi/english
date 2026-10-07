// 按内置精选词条的收录释义标注，不把词典所有义项的词性套到单一语境上。
const groups = [
  ["n.", "transaction"],
  [
    "n.",
    `curriculum literacy tuition qualification assessment scholarship biodiversity emission conservation depletion habitat landfill innovation automation privacy algorithm nutrition obesity prevention diagnosis wellbeing employment productivity entrepreneur recession income incentive redundancy recruitment urbanisation infrastructure congestion pedestrian suburb amenity sprawl inequality welfare legislation subsidy rehabilitation integration accountability heritage diversity censorship stereotype authenticity commercialisation advertising preservation proportion evidence implication goods equity dividend portfolio sponsorship inventory distribution premium client impact authority maturity economist media seller merger consumption variance depreciation entity utility overhead commodity valuation subsidiary allocation absorption acceleration accumulation accuracy acid adaptation admission adolescent agriculture algebra alliance altitude amplitude analogy ancestor anthropology antibiotic antibody appendix approximation array`,
  ],
  [
    "adj.",
    `vocational compulsory sustainable renewable accessible obsolete reliable sedentary chronic affordable gradual substantial feasible beneficial detrimental marginal strategic monetary fiscal payable acute adaptive adjacent adverse aesthetic arbitrary artificial`,
  ],
  ["adv.", "respectively approximately accurately"],
  [
    "v.",
    `regulate commute fluctuate outweigh justify undermine know think make take give find tell ask feel try leave call need become mean keep let begin seem help talk turn start show hear play run move live believe bring write provide sit stand lose pay meet learn hedge obtain publish absorb accelerate accumulate activate affirm allocate assert`,
  ],
  ["n. / v.", "work lease audit default aggregate decline"],
  ["v. / n.", "plateau"],
  ["adj. / n.", "demographic"],
  ["adj. / v.", "approximate"],
];
const values = new Map(
  groups.flatMap(([pos, words]) =>
    words.split(/\s+/).map((word) => [word, pos]),
  ),
);
const phrases = [
  [
    "n. phr.",
    `critical thinking|lifelong learning|equal access to education|academic performance|carbon footprint|fossil fuels|environmental degradation|digital divide|artificial intelligence|data protection|balanced diet|mental health|public health|regular physical activity|work-life balance|job security|transferable skills|living standards|public transport|affordable housing|traffic congestion|quality of life|ageing population|social cohesion|income gap|cultural identity|freedom of expression|misleading information`,
  ],
  [
    "v. phr.",
    `strike a balance|keep pace with|allocate resources|raise awareness|account for|reach a peak|remain stable|take into account|play a crucial role|figure out|give up|look forward to|take care of|pay attention to|get along with|come up with|put off|carry on|find out|run out of|turn down|pick up|set up|make sure|keep in touch|take part in|deal with|get used to|make a difference|add up|fit into|get stuck|put away|leave room for`,
  ],
  [
    "prep. phr.",
    `by contrast|to some extent|in the long term|on time|in advance|by the way|in my opinion|for example|as a result|on the other hand|in charge of|on your own`,
  ],
  ["adv. phr.", "at least|as soon as possible"],
  ["expr.", "what would you recommend?"],
];
for (const [pos, terms] of phrases)
  for (const term of terms.split("|")) values.set(term, pos);
export function curatedPartOfSpeech(term) {
  return values.get(term.trim().toLowerCase()) || "";
}
