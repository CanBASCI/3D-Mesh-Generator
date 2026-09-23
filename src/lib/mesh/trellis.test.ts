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

  it("maps the broken call-api 404", () => {
    assert.match(humanizeTrellisError("404: Not Found"), /oturumu koptu/i);
  });

  it("ignores heartbeat frames", () => {
    assert.equal(parseQueueMessage("data: ALIVE"), null);
  });
});
