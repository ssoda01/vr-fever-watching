const getWaitMs = (minutes: number) => {
  if (minutes === 0) {
    return 3;
  }
  return minutes * 60 * 1000;
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export { getWaitMs, wait };
