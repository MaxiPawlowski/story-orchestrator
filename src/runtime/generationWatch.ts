type OpenedCount = () => number;

let read: OpenedCount | null = null;

export const generationWatch = {
  attach(next: OpenedCount): () => void {
    read = next;
    return () => {
      if (read === next) read = null;
    };
  },
  openedCount(): number | null {
    return read ? read() : null;
  },
};
