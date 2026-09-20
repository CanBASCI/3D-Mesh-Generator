import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { humanizeTrellisError, parseGradioSse } from "./trellis.ts";

describe("trellis sse", () => {
  it("reads the complete event payload", () => {
    const text = [
      "event: estimation",
      'data: {"rank":0,"queue_size":2}',
      "",
      "event: complete",
      'data: [{"url":"https://example.com/a.glb"}]',
      "",
    ].join("\n");
    const parsed = parseGradioSse(text);
    assert.equal(parsed.queue, "Kuyruk 1/2");
    const data = parsed.data as { url: string }[];
    assert.equal(data[0]?.url, "https://example.com/a.glb");
  });

  it("maps GPU quota errors", () => {
    assert.match(humanizeTrellisError("ZeroGPU quota exceeded"), /kuyruğu/i);
  });

  it("throws when the stream never completes", () => {
    assert.throws(() => parseGradioSse("event: heartbeat\ndata: null\n"), /yanıt vermedi/);
  });
});
