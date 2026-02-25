const worker: ExportedHandler = {
  fetch() {
    return new Response('ok', { status: 200 });
  },
  queue() {
    return;
  },
};

export default worker;
