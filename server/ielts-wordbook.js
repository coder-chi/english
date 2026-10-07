// 自编雅思备考材料：例句为原创教学情境，不引用真题，不承诺分数或词频。
// 各主题 8 个单词 + 4 个搭配；词条 ID 与主题顺序独立，便于后续增补。
import { readFileSync } from "node:fs";
import { curatedPartOfSpeech } from "./curated-parts-of-speech.js";
const sections = [
  [
    "教育与学习",
    `
curriculum|课程体系|Schools should review their curriculum regularly.|学校应定期审视其课程体系。
literacy|读写能力|Public libraries can help improve adult literacy.|公共图书馆可以帮助提高成年人的读写能力。
tuition|学费；教学|High tuition fees may discourage students from applying.|高昂的学费可能使学生不愿申请。
qualification|资格；学历|A formal qualification can improve a person's job prospects.|正式的学历或资格证书可以改善一个人的就业前景。
assessment|评估；考核|Continuous assessment can reveal progress over time.|持续考核能够反映一段时间内的进步。
vocational|职业技能的|Vocational courses prepare students for practical work.|职业课程帮助学生为实际工作做好准备。
compulsory|义务的；强制的|Whether foreign language study should be compulsory is widely debated.|外语学习是否应当成为必修内容，受到广泛讨论。
scholarship|奖学金|The scholarship covers her tuition fees and living expenses.|这项奖学金支付她的学费和生活费。
critical thinking|批判性思维|Classroom debates can encourage critical thinking.|课堂辩论可以促进批判性思维。
lifelong learning|终身学习|Lifelong learning helps workers adapt to changing industries.|终身学习帮助劳动者适应不断变化的行业。
equal access to education|平等的受教育机会|Affordable internet can support equal access to education.|可负担的互联网服务有助于实现平等的受教育机会。
academic performance|学业表现|Regular feedback may improve students' academic performance.|定期反馈可能改善学生的学业表现。`,
  ],
  [
    "环境与能源",
    `
biodiversity|生物多样性|Protecting wetlands is one way to preserve biodiversity.|保护湿地是维护生物多样性的一种方式。
emission|排放；排放物|The emission of harmful gases can affect local air quality.|有害气体的排放会影响当地空气质量。
conservation|保护；节约|Water conservation is important in regions with limited rainfall.|在降雨有限的地区，节约用水十分重要。
sustainable|可持续的|Cities need sustainable ways to manage household waste.|城市需要用可持续的方式处理家庭垃圾。
renewable|可再生的|Wind is a renewable source of energy.|风是一种可再生能源。
depletion|消耗；耗竭|Excessive pumping can lead to the depletion of groundwater.|过度抽水可能导致地下水耗竭。
habitat|栖息地|Road construction can divide an animal's habitat.|道路建设可能割裂动物的栖息地。
landfill|垃圾填埋场；垃圾填埋|Repairing products can reduce the amount of waste sent to landfill.|维修产品可以减少被送去填埋的垃圾量。
carbon footprint|碳足迹|Using public transport can help reduce a commuter's carbon footprint.|使用公共交通可以帮助减少通勤者的碳足迹。
fossil fuels|化石燃料|Many industries still depend heavily on fossil fuels.|许多行业仍然严重依赖化石燃料。
environmental degradation|环境退化|Poor waste management can contribute to environmental degradation.|不当的垃圾管理可能加剧环境退化。
strike a balance|取得平衡|Governments must strike a balance between development and conservation.|政府必须在发展与环境保护之间取得平衡。`,
  ],
  [
    "科技与创新",
    `
innovation|创新|Investment in research can encourage innovation.|对研究的投入可以促进创新。
automation|自动化|Automation may replace some repetitive tasks.|自动化可能取代一些重复性任务。
privacy|隐私|Users should understand how an application protects their privacy.|用户应了解应用如何保护他们的隐私。
algorithm|算法|An algorithm can sort large amounts of information quickly.|算法可以快速整理大量信息。
accessible|可获得的；易于使用的|Clear design makes digital services more accessible to older users.|清晰的设计使数字服务更便于老年用户使用。
obsolete|过时的；被淘汰的|Rapid development can make existing devices obsolete.|快速的发展可能使现有设备过时。
reliable|可靠的|A reliable internet connection is essential for remote lessons.|可靠的互联网连接对远程授课至关重要。
regulate|监管；调节|Authorities may need to regulate the use of personal data.|有关部门可能需要监管个人数据的使用。
digital divide|数字鸿沟|Unequal internet access can widen the digital divide.|不平等的互联网接入条件可能扩大数字鸿沟。
artificial intelligence|人工智能|Artificial intelligence can assist doctors in analysing medical images.|人工智能可以协助医生分析医学影像。
data protection|数据保护|Strong data protection rules can increase public trust.|有力的数据保护规定可以提高公众信任。
keep pace with|跟上……的步伐|Training helps employees keep pace with technological change.|培训帮助员工跟上技术变革的步伐。`,
  ],
  [
    "健康与生活方式",
    `
nutrition|营养|Schools can teach children about nutrition through practical activities.|学校可以通过实践活动向儿童传授营养知识。
obesity|肥胖；肥胖症|Obesity has several causes, including diet and physical inactivity.|肥胖有多种成因，包括饮食和缺乏身体活动。
sedentary|久坐的|Office workers may have a sedentary lifestyle.|办公室职员可能过着久坐的生活。
prevention|预防|Disease prevention can reduce pressure on hospitals.|疾病预防可以减轻医院的压力。
diagnosis|诊断|An early diagnosis may improve the chances of successful treatment.|早期诊断可能提高成功治疗的机会。
wellbeing|身心健康；幸福感|Access to green space can support people's wellbeing.|能够使用绿地有助于人们的身心健康。
chronic|慢性的；长期的|Chronic illness can affect a person's ability to work.|慢性疾病可能影响一个人的工作能力。
affordable|负担得起的|Healthy food should be affordable for families on low incomes.|健康食品应当让低收入家庭也负担得起。
balanced diet|均衡饮食|A balanced diet includes a variety of foods.|均衡饮食包括多种食物。
mental health|心理健康|Schools should provide support for students' mental health.|学校应为学生的心理健康提供支持。
public health|公共卫生；公众健康|Clean drinking water is essential for public health.|清洁的饮用水对公众健康至关重要。
regular physical activity|规律的身体活动|Regular physical activity can be built into a daily routine.|规律的身体活动可以融入日常生活。`,
  ],
  [
    "工作与经济",
    `
employment|就业；雇用|Tourism can create employment in rural areas.|旅游业可以在农村地区创造就业机会。
productivity|生产率|Better equipment may improve productivity without increasing working hours.|更好的设备可能在不延长工时的情况下提高生产率。
entrepreneur|创业者；企业家|An entrepreneur must consider both costs and customer needs.|创业者必须同时考虑成本和客户需求。
recession|经济衰退|During a recession, some businesses reduce recruitment.|在经济衰退期间，一些企业会减少招聘。
income|收入|Rising housing costs can absorb a large share of household income.|不断上涨的住房成本可能占据家庭收入的很大一部分。
incentive|激励；诱因|Flexible hours can be an incentive for employees to stay.|弹性工时可以成为员工留下来的动力。
redundancy|裁员；岗位冗余|Workers facing redundancy may need support to retrain.|面临裁员的劳动者可能需要再培训支持。
recruitment|招聘|Online recruitment allows firms to reach a wider range of applicants.|线上招聘使企业能够接触更广泛的求职者。
work-life balance|工作与生活的平衡|Shorter commutes can improve work-life balance.|更短的通勤时间可以改善工作与生活的平衡。
job security|工作保障|Temporary contracts may offer less job security.|临时合同提供的工作保障可能较少。
transferable skills|可迁移技能|Communication and teamwork are transferable skills.|沟通和团队合作是可迁移技能。
living standards|生活水平|Economic growth does not always improve living standards for everyone.|经济增长并不总能提高所有人的生活水平。`,
  ],
  [
    "城市与交通",
    `
urbanisation|城市化|Rapid urbanisation can increase demand for housing.|快速城市化可能增加住房需求。
infrastructure|基础设施|Growing cities need investment in infrastructure.|不断发展的城市需要对基础设施进行投资。
congestion|拥堵|Congestion can make journey times difficult to predict.|拥堵可能使出行时间难以预测。
commute|通勤|Some employees commute for more than an hour each day.|一些员工每天通勤超过一小时。
pedestrian|行人|The new crossing makes the road safer for pedestrians.|新的人行横道使行人过马路更安全。
suburb|郊区|She moved to a suburb with a direct rail link to the city.|她搬到了一个有铁路直达市区的郊区。
amenity|便利设施；生活配套|A library is an important amenity for local residents.|图书馆是当地居民的一项重要生活配套设施。
sprawl|无序扩张；蔓延|Urban sprawl can increase dependence on private cars.|城市无序扩张可能增加人们对私家车的依赖。
public transport|公共交通|Frequent public transport can make car ownership less necessary.|班次密集的公共交通可以降低拥有汽车的必要性。
affordable housing|可负担的住房|Local authorities should consider the need for affordable housing.|地方政府应考虑可负担住房的需求。
traffic congestion|交通拥堵|Flexible working hours may help reduce traffic congestion.|弹性工作时间可能有助于缓解交通拥堵。
quality of life|生活质量|Safe streets and parks can improve residents' quality of life.|安全的街道和公园可以改善居民的生活质量。`,
  ],
  [
    "社会与公共政策",
    `
inequality|不平等|Unequal access to training can reinforce income inequality.|不平等的培训机会可能加剧收入不平等。
demographic|人口统计的；人口群体|Demographic changes can affect the demand for public services.|人口结构变化可能影响对公共服务的需求。
welfare|福利；福祉|Public policy should consider children's welfare.|公共政策应考虑儿童的福祉。
legislation|法律；立法|New legislation may require clearer food labels.|新的法律可能要求食品标签更加清晰。
subsidy|补贴|A subsidy can make public transport cheaper for passengers.|补贴可以降低乘客使用公共交通的费用。
rehabilitation|康复；改造|Education can play a role in the rehabilitation of offenders.|教育可以在违法者的改造中发挥作用。
integration|融入；整合|Language classes can support the integration of newcomers.|语言课程可以帮助新来者融入社会。
accountability|问责；责任制|Publishing clear budgets can improve public accountability.|公开清晰的预算可以加强公共问责。
ageing population|人口老龄化；老龄人口|An ageing population can increase demand for care services.|人口老龄化可能增加对照护服务的需求。
social cohesion|社会凝聚力|Shared community activities may strengthen social cohesion.|共同参与社区活动可能增强社会凝聚力。
income gap|收入差距|The income gap between regions may influence migration.|地区间的收入差距可能影响人口迁移。
allocate resources|分配资源|Governments must allocate resources according to local needs.|政府必须根据当地需求分配资源。`,
  ],
  [
    "文化与媒体",
    `
heritage|遗产；传统|Historic buildings are part of a city's cultural heritage.|历史建筑是一座城市文化遗产的一部分。
diversity|多样性|Local festivals can celebrate cultural diversity.|地方节庆可以展现文化多样性。
censorship|审查；审查制度|The debate about censorship involves both safety and freedom.|关于审查制度的讨论同时涉及安全与自由。
stereotype|刻板印象|Media stories can challenge a stereotype rather than repeat it.|媒体报道可以挑战刻板印象，而非重复它。
authenticity|真实性；原真性|Visitors may value the authenticity of a traditional craft.|游客可能重视传统工艺的原真性。
commercialisation|商业化|Commercialisation can change the character of a local festival.|商业化可能改变地方节庆的特色。
advertising|广告宣传|Advertising can influence consumers' purchasing decisions.|广告宣传可能影响消费者的购买决策。
preservation|保护；保存|Digital records can assist in the preservation of old manuscripts.|数字档案可以帮助保存古老手稿。
cultural identity|文化认同|Language can be an important part of cultural identity.|语言可以是文化认同的重要组成部分。
freedom of expression|表达自由|Freedom of expression allows people to debate public issues.|表达自由使人们能够讨论公共议题。
misleading information|误导性信息|Users should check the source before sharing misleading information.|用户在分享可能误导他人的信息之前，应核查来源。
raise awareness|提高认识；增强意识|Documentaries can raise awareness of endangered languages.|纪录片可以提高人们对濒危语言的认识。`,
  ],
  [
    "图表与数据描述",
    `
fluctuate|波动|In this example, sales fluctuate between 20 and 30 units.|在这个例子中，销量在20至30件之间波动。
plateau|趋于稳定；平台期|The figure rises initially and then reaches a plateau.|该数值起初上升，随后进入平台期。
proportion|比例；部分|The chart compares the proportion of income spent on food.|该图表比较了用于食品支出的收入比例。
respectively|分别地|The two figures are 15 and 25, respectively.|这两个数值分别为15和25。
approximately|大约|Approximately one third of the sample chose the first option.|样本中大约三分之一的人选择了第一个选项。
gradual|逐渐的|The example chart shows a gradual increase in demand.|示例图表显示需求逐渐增长。
substantial|大量的；显著的|The data show a substantial difference between the two groups.|数据显示两组之间存在显著差异。
decline|下降；减少|The percentage falls steadily before the decline slows.|该百分比先稳步下降，随后降幅放缓。
account for|占；解释|In this sample, bus journeys account for 40 percent of all trips.|在这个样本中，公交出行占所有出行的40%。
reach a peak|达到峰值|The figures are expected to reach a peak in July.|预计这些数值将在七月达到峰值。
remain stable|保持稳定|The number of visitors is likely to remain stable.|游客人数可能保持稳定。
by contrast|相比之下|Rail use increased; by contrast, car use fell.|铁路使用量增加；相比之下，汽车使用量下降。`,
  ],
  [
    "论证与观点表达",
    `
evidence|证据|A strong argument should be supported by evidence.|有力的论证应有证据支持。
implication|可能的影响；含义|One implication of remote work is lower demand for office space.|远程办公可能带来的一个影响是办公空间需求下降。
feasible|可行的|A proposal must be both affordable and feasible.|提案必须既能负担得起，又切实可行。
beneficial|有益的|Smaller classes may be beneficial for students who need extra help.|小班教学可能有益于需要额外帮助的学生。
detrimental|有害的；不利的|Excessive noise can be detrimental to concentration.|过度的噪声可能不利于专注。
outweigh|超过；比……更重要|The benefits may outweigh the costs in the long term.|从长远来看，收益可能超过成本。
justify|证明……合理|Lower costs alone may not justify a reduction in safety standards.|仅凭成本降低，可能不足以证明降低安全标准是合理的。
undermine|削弱；损害|Inconsistent rules can undermine public confidence.|不一致的规定可能削弱公众信心。
to some extent|在某种程度上|To some extent, flexible hours can reduce commuting pressure.|在某种程度上，弹性工时可以减轻通勤压力。
in the long term|从长远来看|In the long term, prevention may be cheaper than treatment.|从长远来看，预防可能比治疗成本更低。
take into account|考虑到|Planners should take into account the needs of disabled residents.|规划者应考虑残障居民的需求。
play a crucial role|发挥关键作用|Teachers play a crucial role in encouraging curiosity.|教师在激发好奇心方面发挥关键作用。`,
  ],
];

export const ieltsWordbook = {
  id: "ielts-topic-essentials",
  title: "雅思备考主题精选",
  english: "Ideas into words",
  subtitle: "10 个备考主题，单词与实用搭配一起学，每条都有双语例句。",
  theme: "slate",
  level: "雅思专项",
  category: "雅思",
  edition: "原创备考材料 · 120 条 · 10 个主题",
  sourceType: "内置原创",
  sourceUrl: null,
  authors: "Small Steps",
  license: "CC BY-SA 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  note: "自编主题学习材料，含 80 个单词和 40 个搭配，覆盖教育、环境、科技、健康、工作经济、城市交通、社会政策、文化媒体、图表描述与论证表达。非 IELTS 官方词表，不是完整考试词汇大纲，也不代表某一分数档。释义选择例句中的常见义，例句均为原创教学情境；图表描述主要用于 Academic Writing Task 1。导入的新卡片按“雅思·主题”分类。",
  entries: sections.flatMap(([topic, rows]) =>
    rows
      .trim()
      .split("\n")
      .map((row) => {
        const [term, meaning, example, translation] = row.split("|");
        return {
          id: term.replaceAll(" ", "-"),
          term,
          meaning,
          partOfSpeech: curatedPartOfSpeech(term),
          example,
          translation,
          kind: term.includes(" ") ? "phrase" : "word",
          category: `雅思·${topic}`,
          note: `雅思主题：${topic}。结合例句理解语境，再尝试用自己的经历改写。`,
        };
      }),
  ),
};

// 保持首版120条的 ID、释义、笔记及顺序，已导入卡片不会随词库扩充被重写。
export const ieltsCoreEntries = ieltsWordbook.entries;
if (process.env.BUILD_LEXICON !== "1") {
  const expanded = JSON.parse(
    readFileSync(
      new URL("./data/ielts-expanded.json", import.meta.url),
      "utf8",
    ),
  );
  ieltsWordbook.entries = [
    ...ieltsCoreEntries.map((entry) => ({
      ...entry,
      section: "主题精练",
      provenance: "Small Steps 原创",
    })),
    ...expanded.entries,
  ];
  ieltsWordbook.subtitle =
    "从高频基础到学术阅读，分层积累，面向雅思 6.5 备考。";
  ieltsWordbook.edition = `${ieltsWordbook.entries.length} 条 · 高频 / 学术 / 拓展 / 主题精练`;
  ieltsWordbook.sourceType = "开放词表与词典整合";
  ieltsWordbook.authors = "NGSL/NAWL 作者、ECDICT 贡献者、Small Steps";
  ieltsWordbook.license = "CC BY-SA 4.0；词典另含 MIT 声明";
  ieltsWordbook.references = [
    {
      label: "NGSL 官方词表",
      url: "https://www.newgeneralservicelist.com/new-general-service-list",
    },
    {
      label: "NAWL 官方词表",
      url: "https://www.newgeneralservicelist.com/new-academic-word-list",
    },
    {
      label: "ECDICT 词典与社区标签",
      url: "https://github.com/skywind3000/ECDICT",
    },
    {
      label: "雅思官方评分说明",
      url: "https://ielts.org/take-a-test/preparation-resources/writing-test-resources",
    },
  ];
  ieltsWordbook.note = `共 ${ieltsWordbook.entries.length} 条去重词头及短语，整合 NGSL 高频词、NAWL 学术词、ECDICT 社区 IELTS 标签与原有 120 条主题精练。并非官方 IELTS 必背清单，词条数不等于词族数，更不等于 6.5 分门槛。扩展词的中文释义来自 ECDICT，经自动清洗，尚未逐条人工审校；扩展词不保证附例句，原有精练保留双语例句。建议先认读高频词，再练主题搭配、同义改写与语境中的准确用词。`;
}
