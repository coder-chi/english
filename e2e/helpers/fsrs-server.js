// 仅测试进程通过 IPC 推进时间，生产服务不提供时间修改接口。
let now = Number(process.env.FSRS_TEST_TIME);
Date.now = () => now;
process.on("message", (message) => {
  now = message.now;
  process.send({ now });
});
await import("../../server/index.js");
process.send({ ready: true });
