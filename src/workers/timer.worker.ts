// A simple Web Worker to provide a stable interval tick
// This avoids aggressive throttling by the browser when the tab is in the background.

let intervalId: any = null;

self.onmessage = (e) => {
  if (e.data === 'start') {
    if (!intervalId) {
      intervalId = setInterval(() => {
        self.postMessage('tick');
      }, 10);
    }
  } else if (e.data === 'stop') {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }
};
