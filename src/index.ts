// Point d'entrée du Worker — remplacé en phase 6 (transport MCP, §8/§9).
export default {
  async fetch(): Promise<Response> {
    return new Response("Not found", { status: 404 });
  },
};
