import { db, getSetting, setSetting } from "./store.js";
import { AppError } from "./services.js";

const initialReading = {
  id: "one-city-many-choices",
  title: "一座城市的多重选择",
  englishTitle: "One City, Many Choices",
  subtitle: "发展不只关乎增长，也关乎一座城市如何分配机会、成本与未来。",
  level: "B2-C1",
  topic: "城市转型",
  paragraphs: [
    {
      en: "Urbanisation can improve living standards, but rapid sprawl often creates traffic congestion. In the fictional city of Lydon, a long commute and weak infrastructure reduced quality of life, especially in each outer suburb. The council therefore invested in public transport, affordable housing, pedestrian streets, and access to each essential amenity. Its aim was not simply to make the centre accessible, but to build a sustainable city where people from every demographic could participate.",
      zh: "城市化可以提高生活水平，但快速的无序扩张往往会造成交通拥堵。在虚构城市莱登，漫长的通勤和薄弱的基础设施降低了生活质量，外围郊区尤其如此。因此，市议会投资建设公共交通、可负担住房、步行街和各类基本生活配套。其目标不仅是让市中心更易到达，更是建设一座让不同人口群体都能参与其中的可持续城市。",
    },
    {
      en: "The environmental plan addressed environmental degradation caused by high emission levels from fossil fuels. New legislation offered a subsidy and an incentive for renewable energy, while stricter rules tried to regulate waste sent to landfill. Conservation teams restored habitat and biodiversity, and schools explained how resource depletion increases a city's carbon footprint. The challenge was to strike a balance: the policy had to be feasible for business as well as beneficial for the planet.",
      zh: "环境方案着手处理化石燃料排放造成的环境退化。新立法为可再生能源提供补贴和激励，同时以更严格的规定监管送往垃圾填埋场的废弃物。保护团队修复栖息地和生物多样性，学校则讲解资源耗竭如何增加一座城市的碳足迹。真正的挑战在于取得平衡：政策既要对企业可行，也要对地球有益。",
    },
    {
      en: "Public health became another priority. A sedentary lifestyle had contributed to obesity and chronic illness, so prevention mattered as much as diagnosis and rehabilitation. Clinics made nutrition advice and mental health support more affordable and accessible. A campaign promoted a balanced diet and regular physical activity, arguing that personal wellbeing and public welfare reinforce each other. Over time, these measures produced a substantial improvement in the population's quality of life.",
      zh: "公共卫生成为另一项重点。久坐的生活方式导致了肥胖和慢性疾病，因此预防与诊断和康复同样重要。诊所让营养建议和心理健康支持变得更可负担、更容易获得。一项宣传活动提倡均衡饮食和规律运动，并指出个人身心健康与公共福祉会相互促进。随着时间推移，这些措施显著改善了居民的生活质量。",
    },
    {
      en: "Education also had to keep pace with change. Schools revised the curriculum to strengthen literacy, critical thinking, and digital skills. Regular assessment measured academic performance, but exam scores were not the only goal. The city defended equal access to education by limiting tuition, expanding its scholarship programmes, and connecting compulsory schooling with vocational courses. Students gained a useful qualification and transferable skills, while adults were encouraged to see lifelong learning as normal.",
      zh: "教育也必须跟上变化的步伐。学校调整课程体系，以加强读写能力、批判性思维和数字技能。定期评估衡量学业表现，但考试分数并非唯一目标。城市通过限制学费、扩大奖学金，并把义务教育与职业课程衔接起来，保障平等的受教育机会。学生获得实用学历和可迁移技能，成年人也被鼓励把终身学习视为常态。",
    },
    {
      en: "The economic transition was less comfortable. During a recession, automation and artificial intelligence made some equipment obsolete and led to redundancy. Yet the same innovation created employment and helped an entrepreneur who could use a reliable algorithm responsibly. Recruitment began to value ability as well as formal qualification. To protect job security, the city funded retraining and asked employers to improve work-life balance. Higher productivity mattered, but it could not justify weak data protection, lost privacy, or a wider digital divide.",
      zh: "经济转型并不轻松。经济衰退期间，自动化和人工智能使部分设备过时，并导致裁员。然而，同样的创新也为能够负责任地使用可靠算法的创业者创造了就业机会。招聘开始同时重视实际能力和正式学历。为了保护工作保障，城市资助再培训，并要求雇主改善工作与生活的平衡。更高的生产率固然重要，但它不能成为削弱数据保护、牺牲隐私或扩大数字鸿沟的理由。",
    },
    {
      en: "Culture raised equally difficult questions. Tourism could support heritage preservation, but commercialisation and advertising can undermine authenticity and cultural identity. Public media tried to raise awareness of diversity without repeating a stereotype or spreading misleading information. The city protected freedom of expression and rejected broad censorship, while requiring accountability when public money was used. These choices helped integration and social cohesion, although an ageing population, inequality, and the income gap still shaped how officials had to allocate resources.",
      zh: "文化领域提出了同样棘手的问题。旅游业能够支持遗产保护，但商业化和广告有时会削弱原真性与文化认同。公共媒体努力提高人们对多样性的认识，同时避免重复刻板印象或传播误导性信息。城市保护表达自由、拒绝宽泛的审查制度，同时要求公共资金的使用必须接受问责。这些选择促进了社会融入与凝聚力，不过人口老龄化、不平等和收入差距仍然影响着官员如何分配资源。",
    },
    {
      en: "After ten years, the evidence was mixed but encouraging. The proportion of journeys made by public transport showed a gradual rise and was expected to reach a peak at approximately 62 percent before entering a plateau; by contrast, car use began to decline. Energy prices continued to fluctuate, while household income and employment were likely to remain stable. Transport and housing account for 18 and 27 percent of new spending, respectively. To some extent, every reform had a potentially detrimental implication as well as a clear benefit. Leaders had to take into account who paid the cost and ask whether the gains would outweigh it. In the long term, transparent evidence and public trust play a crucial role in deciding which changes can be justified.",
      zh: "十年后，证据有好有坏，但总体令人鼓舞。公共交通使用率逐渐上升，在大约 62% 时达到峰值；相比之下，汽车使用率开始下降。能源价格继续波动，而家庭收入和就业保持稳定。两个领域分别占新增支出的 18% 和 27%。在某种程度上，每项改革既有收益，也会带来不利影响。决策者必须考虑由谁承担成本，并判断收益是否超过代价。从长远来看，透明的证据和公众信任在判断哪些改变合理时发挥着关键作用。",
    },
  ],
};

function containsTerm(text, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Za-z])${escaped}(?=$|[^A-Za-z])`, "i").test(text);
}

function readingText(reading) {
  return reading.paragraphs.map((paragraph) => paragraph.en).join("\n");
}

function learnedTargets(reading) {
  const text = readingText(reading);
  const learned = db
    .prepare(
      `SELECT id, term, meaning, kind, part_of_speech
       FROM cards
       WHERE learned_at IS NOT NULL AND archived = 0
       ORDER BY LENGTH(term) DESC, term`,
    )
    .all();
  return learned
    .filter((card) => containsTerm(text, card.term))
    .sort(
      (a, b) =>
        text.toLowerCase().indexOf(a.term.toLowerCase()) -
          text.toLowerCase().indexOf(b.term.toLowerCase()) ||
        b.term.length - a.term.length,
    )
    .map((card, index) => ({ ...card, number: index + 1 }));
}

function ensureInitialReading() {
  const existing = db
    .prepare("SELECT id FROM review_readings WHERE id = ?")
    .get(initialReading.id);
  if (existing) return;
  const legacy = getSetting(`review-reading:${initialReading.id}`, {
    completions: 0,
    lastCompletedAt: null,
  });
  const payload = {
    ...initialReading,
    targets: learnedTargets(initialReading),
    generatedFromLearned: db
      .prepare(
        "SELECT COUNT(*) AS n FROM cards WHERE learned_at IS NOT NULL AND archived = 0",
      )
      .get().n,
  };
  db.prepare(
    `INSERT INTO review_readings
      (id, payload, created_at, completed_count, last_completed_at)
      VALUES (?, ?, ?, ?, ?)`,
  ).run(
    payload.id,
    JSON.stringify(payload),
    Date.now(),
    legacy.completions,
    legacy.lastCompletedAt,
  );
}

function rowToReading(row) {
  const value = JSON.parse(row.payload);
  const text = readingText(value);
  return {
    ...value,
    createdAt: row.created_at,
    targets: value.targets || [],
    stats: {
      learned: value.generatedFromLearned || value.targets?.length || 0,
      covered: value.targets?.length || 0,
      words:
        value.targets?.filter((target) => target.kind === "word").length || 0,
      phrases:
        value.targets?.filter((target) => target.kind === "phrase").length || 0,
      wordCount: text.split(/\s+/).filter(Boolean).length,
    },
    progress: {
      completions: row.completed_count,
      lastCompletedAt: row.last_completed_at,
    },
  };
}

export function listReviewReadings() {
  ensureInitialReading();
  return db
    .prepare(
      "SELECT * FROM review_readings ORDER BY created_at DESC, rowid DESC",
    )
    .all()
    .map((row) => {
      const value = rowToReading(row);
      return {
        id: value.id,
        title: value.title,
        englishTitle: value.englishTitle,
        subtitle: value.subtitle,
        level: value.level,
        topic: value.topic,
        createdAt: value.createdAt,
        paragraphCount: value.paragraphs.length,
        stats: value.stats,
        progress: value.progress,
      };
    });
}

export function getReviewReading(input = {}) {
  ensureInitialReading();
  const id =
    input.id ||
    db
      .prepare(
        "SELECT id FROM review_readings ORDER BY created_at DESC, rowid DESC LIMIT 1",
      )
      .get()?.id;
  const row = db.prepare("SELECT * FROM review_readings WHERE id = ?").get(id);
  if (!row) throw new AppError("复习短文不存在。", 404);
  return rowToReading(row);
}

export function completeReviewReading(input = {}) {
  ensureInitialReading();
  const id = typeof input.id === "string" ? input.id : "";
  const row = db
    .prepare("SELECT completed_count FROM review_readings WHERE id = ?")
    .get(id);
  if (!row) throw new AppError("复习短文不存在。", 404);
  const progress = {
    completions: row.completed_count + 1,
    lastCompletedAt: Date.now(),
  };
  db.prepare(
    `UPDATE review_readings
     SET completed_count = ?, last_completed_at = ?
     WHERE id = ?`,
  ).run(progress.completions, progress.lastCompletedAt, id);
  setSetting(`review-reading:${id}`, progress);
  return progress;
}
