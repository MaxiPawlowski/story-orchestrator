let servedFor: (url: string) => number | null = () => null;

export const readServedContextWith = (read: (url: string) => number | null): (() => void) => {
  servedFor = read;
  return () => {
    if (servedFor === read) servedFor = () => null;
  };
};

export const servedContextFor = (url: string): number | null => servedFor(url);
