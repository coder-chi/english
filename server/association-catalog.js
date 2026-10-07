// 辨析与例句为学习用原创整理；词典链接供核对常见词义，不表示可在所有语境互换。
const entry = (term, meaning, usage, example, translation) => ({
  term,
  meaning,
  usage,
  example,
  translation,
  reference: `https://dictionary.cambridge.org/dictionary/english/${term}`,
});
export const associationCatalog = [
  {
    id: "conservation-preservation",
    type: "meaning",
    common: "都可表达保护、保存，让有价值的事物免受损害。",
    contrast:
      "conservation 常用于自然、野生生物与资源保护，也强调节约使用；preservation 更突出保存、维持状态或防止腐坏。两者在自然和历史建筑保护中会重叠，不宜硬分成“允许利用”和“完全不碰”。",
    words: [
      entry(
        "conservation",
        "保护；节约",
        [
          "wildlife conservation · 野生生物保护",
          "water conservation · 节约用水",
        ],
        "Water conservation helps the city cope with dry summers.",
        "节约用水有助于这座城市应对干旱的夏季。",
      ),
      entry(
        "preservation",
        "保存；维护",
        [
          "food preservation · 食品保存",
          "the preservation of historic buildings · 历史建筑保护",
        ],
        "The museum uses special lighting for the preservation of old photographs.",
        "博物馆使用特殊照明来保存老照片。",
      ),
    ],
  },
  {
    id: "conservation-protection",
    type: "meaning",
    common: "都与保护有关，可以在自然环境话题中一起记。",
    contrast:
      "protection 的范围更广，常表示防止人或事物受到伤害、损失；conservation 常用于自然、建筑或资源的保护，也有资源节约之意。谈消费者保护通常用 consumer protection。",
    words: [
      entry(
        "conservation",
        "保护；节约",
        ["nature conservation · 自然保护"],
        "The team studies forest conservation.",
        "这个团队研究森林保护。",
      ),
      entry(
        "protection",
        "保护；防护",
        ["consumer protection · 消费者保护", "protection from the sun · 防晒"],
        "This hat offers protection from the sun.",
        "这顶帽子可以遮挡阳光。",
      ),
    ],
  },
  {
    id: "conserve-conservation",
    type: "family",
    common: "同词族：动词 conserve 与名词 conservation。",
    contrast:
      "conserve 表示保护或节省这一动作；conservation 是相应的名词。可以把 conserve water 与 water conservation 成对记，而不是在句中原位替换。",
    words: [
      entry(
        "conserve",
        "保护；节省（动词）",
        ["conserve water · 节约用水", "conserve energy · 节约能源"],
        "We conserve water by fixing leaking taps.",
        "我们通过修理漏水的水龙头来节约用水。",
      ),
      entry(
        "conservation",
        "保护；节约（名词）",
        ["energy conservation · 节约能源"],
        "Energy conservation is part of the plan.",
        "节约能源是计划的一部分。",
      ),
    ],
  },
  {
    id: "preserve-preservation",
    type: "family",
    common: "同词族：动词 preserve 与名词 preservation。",
    contrast:
      "preserve 描述保存、保持或保护的动作；preservation 表示保存这一过程或状态。先记 preserve food，再联想 food preservation。",
    words: [
      entry(
        "preserve",
        "保存；保持（动词）",
        ["preserve food · 保存食物", "preserve traditions · 保留传统"],
        "Freezing helps preserve food.",
        "冷冻有助于保存食物。",
      ),
      entry(
        "preservation",
        "保存；维护（名词）",
        ["food preservation · 食品保存"],
        "Food preservation reduces waste.",
        "保存食物有助于减少浪费。",
      ),
    ],
  },
  {
    id: "economic-economical",
    type: "spelling",
    common: "拼写相近，也都容易被中文“经济”混在一起。",
    contrast:
      "economic 通常指与经济、贸易或金钱有关；economical 通常指节省金钱、时间或资源。economic growth 是经济增长，an economical car 是省钱、省油的车。",
    words: [
      entry(
        "economic",
        "经济的；经济方面的",
        ["economic growth · 经济增长", "economic policy · 经济政策"],
        "The report discusses economic growth.",
        "报告讨论了经济增长。",
      ),
      entry(
        "economical",
        "节约的；经济实惠的",
        ["an economical car · 经济实惠的车"],
        "This small car is economical to run.",
        "这辆小汽车的使用成本较低。",
      ),
    ],
  },
  {
    id: "efficient-effective",
    type: "meaning",
    common: "都能用于评价方法或工作，但评价的角度不同。",
    contrast:
      "effective 着眼于是否达到预期效果；efficient 着眼于完成事情时是否少浪费时间、精力或资源。一个方法可能有效，但效率不高。",
    words: [
      entry(
        "efficient",
        "高效的",
        ["an efficient process · 高效的流程"],
        "The new process is more efficient and takes less time.",
        "新流程效率更高，耗时更少。",
      ),
      entry(
        "effective",
        "有效的",
        ["an effective treatment · 有效的治疗"],
        "The treatment was effective in reducing pain.",
        "这种治疗有效缓解了疼痛。",
      ),
    ],
  },
  {
    id: "adapt-adopt",
    type: "spelling",
    common: "只差一个元音，适合放在一起观察拼写和搭配。",
    contrast:
      "adapt 表示适应或改编，常见 adapt to；adopt 表示采用或收养。形近不表示近义。",
    words: [
      entry(
        "adapt",
        "适应；改编",
        ["adapt to change · 适应变化"],
        "We need to adapt to the new schedule.",
        "我们需要适应新的日程。",
      ),
      entry(
        "adopt",
        "采用；收养",
        ["adopt a policy · 采用一项政策"],
        "The school will adopt a new policy.",
        "学校将采用一项新政策。",
      ),
    ],
  },
  {
    id: "affect-effect",
    type: "spelling",
    common: "都能与“影响”相关，常见用法中的词性不同。",
    contrast:
      "常见表达中 affect 是动词“影响”，effect 是名词“影响、效果”，如 affect sleep 与 have an effect on sleep。这是常见用法，不是绝对词性规则；effect 也可作动词表示“实现、促成”。",
    words: [
      entry(
        "affect",
        "影响（常作动词）",
        ["affect sleep · 影响睡眠"],
        "Noise can affect sleep.",
        "噪声可能影响睡眠。",
      ),
      entry(
        "effect",
        "影响；效果（常作名词）",
        ["have an effect on · 对……有影响"],
        "Noise can have an effect on sleep.",
        "噪声可能对睡眠产生影响。",
      ),
    ],
  },
];
