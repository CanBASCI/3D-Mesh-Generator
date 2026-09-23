import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { humanizeTrellisError, parseQueueMessage, queueStatus } from "./trellis.ts";

describe("trellis queue", () => {
  it("parses a completed queue event", () => {
    const msg = parseQueueMessage(
      'data: {"msg":"process_completed","event_id":"abc","success":true,"output":{"data":[{"url":"https://example.com/a.glb"}]}}',
    );
    assert.equal(msg?.success, true);
    assert.equal(msg?.event_id, "abc");
  });

  it("formats queue position", () => {
    assert.equal(queueStatus({ msg: "estimation", rank: 0, queue_size: 2 }), "Kuyruk 1/2");
  });

  it("explains a spent ZeroGPU quota", () => {
    const text = humanizeTrellisError(
      "You have exceeded your ZeroGPU quota (120s requested vs. 162s left). Try again in 23:59:20.",
    );
    assert.match(text, /GPU hakkı bitti/);
    assert.match(text, /23:59:20/);
  });

  it("ignores heartbeat frames", () => {
    assert.equal(parseQueueMessage("data: ALIVE"), null);
  });
});
