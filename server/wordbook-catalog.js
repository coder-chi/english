// 官方开放词表仅用于选词；中文释义为本项目编写，内容包按 CC BY-SA 4.0 提供。
// 稳定的书籍 ID、词条 ID 用于幂等导入，后续更新不得复用旧 ID 表示不同的词。
import { ieltsWordbook } from "./ielts-wordbook.js";
import { curatedPartOfSpeech } from "./curated-parts-of-speech.js";
const licenseUrl = "https://creativecommons.org/licenses/by-sa/4.0/";
function entries(rows) {
  return rows
    .trim()
    .split("\n")
    .map((row) => {
      const [term, meaning] = row.split("|");
      return {
        id: term.toLowerCase().replaceAll(" ", "-"),
        term,
        meaning,
        partOfSpeech: curatedPartOfSpeech(term),
        kind: term.includes(" ") ? "phrase" : "word",
        example: "",
        translation: "",
      };
    });
}
export const wordbooks = [
  ieltsWordbook,
  {
    id: "ngsl-everyday",
    title: "NGSL 日常核心精选",
    english: "Everyday essentials",
    subtitle: "从日常高频动词开始，建立表达的基础。",
    theme: "sage",
    level: "基础",
    category: "生活",
    edition: "基于 NGSL 1.2 · 精选 40 词",
    sourceType: "官方开放词表选编",
    sourceUrl: "https://www.newgeneralservicelist.com/new-general-service-list",
    downloadUrl: "https://www.newgeneralservicelist.com/s/NGSL_12_stats.csv",
    authors: "Charles Browne, Brent Culligan, Joseph Phillips",
    license: "CC BY-SA 4.0",
    licenseUrl,
    note: "从 NGSL 1.2 中选编的学习词书，并非完整的 2809 词原表。中文常见义由 Small Steps 编写，非官方译本；排列顺序为本项目学习顺序，不表示原表频次。",
    entries: entries(`
know|知道；了解
think|思考；认为
make|制作；使成为
take|拿；带走
give|给予
find|找到；发现
tell|告诉
ask|询问；请求
work|工作
feel|感觉；感受
try|尝试
leave|离开；留下
call|打电话；称呼
need|需要
become|变成
mean|意思是
keep|保持；保留
let|让；允许
begin|开始
seem|似乎
help|帮助
talk|交谈
turn|转动；转向
start|开始；启动
show|展示；表明
hear|听见
play|玩；演奏
run|跑；运行
move|移动
live|居住；生活
believe|相信
bring|带来
write|写
provide|提供
sit|坐
stand|站立
lose|失去；输掉
pay|支付
meet|遇见；会面
learn|学习`),
  },
  {
    id: "bsl-business",
    title: "BSL 商务表达精选",
    english: "The language of business",
    subtitle: "读懂业务、财务与团队沟通中的关键概念。",
    theme: "clay",
    level: "进阶",
    category: "职场",
    edition: "基于 BSL 1.2 · 精选 40 词",
    sourceType: "官方开放词表选编",
    sourceUrl: "https://www.newgeneralservicelist.com/business-service-list",
    downloadUrl: "https://www.newgeneralservicelist.com/s/BSL_120_stats.csv",
    authors: "Charles Browne, Brent Culligan",
    license: "CC BY-SA 4.0",
    licenseUrl,
    note: "从 BSL 1.2 的 1700 词中选编，非完整词表。中文释义由 Small Steps 编写，重点选择商务语境中的常见义，非官方译本。",
    entries: entries(`
goods|商品；货物
equity|股权；权益
dividend|股息；红利
portfolio|投资组合
sponsorship|赞助
inventory|库存；存货清单
transaction|交易
lease|租约；租赁
hedge|对冲；规避风险
distribution|分销；分配
premium|保险费；溢价
client|客户
impact|影响
authority|权力；主管机构
obtain|获得
maturity|到期；成熟
publish|出版；发布
economist|经济学家
media|媒体
marginal|边际的；微小的
seller|卖方
merger|合并；企业并购
audit|审计
consumption|消费；消耗
variance|差异；方差
depreciation|折旧；贬值
strategic|战略性的
recession|经济衰退
entity|实体；机构
utility|效用；公用事业
productivity|生产率
overhead|经常性管理费用
commodity|商品；大宗商品
monetary|货币的
valuation|估值
fiscal|财政的
payable|应付的
default|违约；拖欠
subsidiary|子公司
allocation|分配；配置`),
  },
  {
    id: "nawl-academic",
    title: "NAWL 学术阅读精选",
    english: "Read, reason, explore",
    subtitle: "积累阅读论文与分析问题时常见的词汇。",
    theme: "slate",
    level: "进阶",
    category: "科技",
    edition: "基于 NAWL 1.2 · 精选 40 词",
    sourceType: "官方开放词表选编",
    sourceUrl: "https://www.newgeneralservicelist.com/new-academic-word-list",
    downloadUrl:
      "https://www.newgeneralservicelist.com/s/NAWL_12_lemmatized_for_teaching.csv",
    authors: "Charles Browne, Brent Culligan, Joseph Phillips",
    license: "CC BY-SA 4.0",
    licenseUrl,
    note: "从 NAWL 1.2 的 957 词中选编，非完整词表。中文常见义由 Small Steps 编写，非官方译本；不代表特定考试大纲。",
    entries: entries(`
absorb|吸收
absorption|吸收；专注
accelerate|加速
acceleration|加速度；加速
accumulate|积累
accumulation|积累；堆积
accuracy|准确性
accurately|准确地
acid|酸
activate|激活；使运作
acute|急性的；敏锐的
adaptation|适应；改编
adaptive|适应性的
adjacent|邻近的
admission|准许进入；承认
adolescent|青少年
adverse|不利的
aesthetic|美学的；审美的
affirm|肯定；确认
aggregate|总计；聚合
agriculture|农业
algebra|代数
algorithm|算法
alliance|联盟
allocate|分配
allocation|分配；配置
altitude|海拔；高度
amplitude|振幅
analogy|类比
ancestor|祖先
anthropology|人类学
antibiotic|抗生素
antibody|抗体
appendix|附录；阑尾
approximate|近似的；大致估算
approximation|近似值；近似
arbitrary|任意的；武断的
array|数组；一系列
artificial|人工的；人造的
assert|断言；坚称`),
  },
  {
    id: "everyday-phrases",
    title: "日常实用短语",
    english: "Little phrases, big possibilities",
    subtitle: "把熟悉的单词组合成真正用得上的表达。",
    theme: "ochre",
    level: "基础 / 进阶",
    category: "生活",
    edition: "Small Steps 原创 · 30 个短语",
    sourceType: "内置原创",
    sourceUrl: null,
    authors: "Small Steps",
    license: "CC BY-SA 4.0",
    licenseUrl,
    note: "由本项目独立整理的常用表达与中文释义，不属于任何出版社或考试机构的官方词书。",
    entries: entries(`
figure out|弄清楚；想出
give up|放弃
look forward to|期待
take care of|照顾；处理
pay attention to|注意
get along with|与……相处
come up with|想出；提出
put off|推迟
carry on|继续
find out|查明；发现
run out of|用完；耗尽
turn down|拒绝；调低
pick up|捡起；接人
set up|建立；设置
make sure|确保
keep in touch|保持联系
take part in|参加
on time|准时
in advance|提前
at least|至少
by the way|顺便说一下
as soon as possible|尽快
in my opinion|在我看来
for example|例如
as a result|因此；结果
on the other hand|另一方面
in charge of|负责
deal with|处理；应对
get used to|习惯于
make a difference|产生影响；起作用`),
  },
];
