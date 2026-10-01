import { maxTokensCap, maxTokensFor } from "./callBudget";

const OLD_BUDGET = 1024;

const RECORDED_READ_OUTPUT_TOKENS: Record<string, number[]> = {
  "T1-1-1": [
    841, 892, 498, 900, 952, 1024, 1102, 706, 973, 800, 905, 985, 1024, 1064, 904, 682, 996, 725, 823, 912, 901, 650, 791, 676,
    802, 757, 804, 864, 622, 727, 637, 728, 1012, 773, 490, 812, 1024, 777, 831, 924, 735, 896, 999, 948, 643, 776, 627, 627,
    749, 869, 555, 866, 872, 734, 747, 801, 891, 415, 1024, 1041, 1024, 1259, 760, 943, 998,
  ],
  "T1-2-1": [
    1024, 977, 526, 682, 735, 758, 788, 890, 692, 1024, 1022, 1024, 1085, 794, 828, 880, 1024, 1038, 1017, 1010, 1024, 1407, 787, 841,
  ],
  "T1-3-1": [
    501, 684, 641, 821, 1024, 1318, 619, 1023, 1024, 1386, 667, 745, 786, 805, 1024, 1272, 780, 1024, 1510, 720, 617, 758, 1024, 1148,
    566, 702, 847, 622, 727, 625, 386, 688, 742, 704,
  ],
  "T1-4-1": [
    517, 457, 625, 624, 777, 756, 730, 1024, 1125, 1024, 1031, 898, 719, 575, 767, 839, 748, 859, 687, 674, 811, 691, 777, 814,
    681, 785, 581, 966, 837, 563, 994, 1024, 872, 1024, 670, 694, 1024, 992, 954, 720, 690, 745, 1024, 1007, 1024, 974, 918, 802,
  ],
  "T1-5-1": [
    618, 413, 464, 818, 723, 768, 753, 526, 618, 580, 631, 695, 712, 1024, 1059, 653, 665, 841, 1024, 940, 945, 789, 875, 875,
    961, 1008, 708, 847, 998, 728, 534, 1024, 1309, 994,
  ],
  "T1-6-1": [
    399, 621, 503, 698, 703, 1024, 1046, 1024, 993, 690, 864, 893, 688, 713, 702, 765, 743, 912, 1024, 1274, 689, 873, 625, 903,
    991, 1024, 1089, 978, 763, 961, 661, 891, 909, 1019, 520, 1024, 1075, 841, 989, 906, 867,
  ],
  "T1-7-1": [
    685, 305, 1024, 1056, 723, 717, 944, 537, 934, 1024, 1014, 504, 501, 525, 758, 759, 725, 753, 909, 740, 1024, 1116, 804, 982,
    883, 752, 831, 1024, 851, 877, 998,
  ],
  "T2-2-1": [
    527, 535, 595, 632, 654, 792, 685, 691, 854, 1024, 930, 1024, 1131, 1024, 1340, 1024, 1203, 1024, 1496, 853, 1024, 944, 901, 684,
    724, 917, 830, 816, 816, 995, 875, 595, 631, 647, 988, 996,
  ],
  "T2-4-1": [975, 1024, 1030, 653, 455, 807, 936, 873, 940, 591, 1024, 1135, 1024, 1023, 949, 728, 938],
  "T2-6-1": [
    946, 884, 659, 842, 910, 470, 681, 457, 428, 973, 826, 1024, 924, 505, 817, 875, 933, 851, 893, 1024, 1175, 885, 1024, 949,
    997, 851,
  ],
};

const outputs = Object.values(RECORDED_READ_OUTPUT_TOKENS).flat();
const truncated = (output: number) => output === OLD_BUDGET || output === OLD_BUDGET - 1;
const completed = outputs.filter((output) => !truncated(output));

describe("T2-2: the shared read's response budget holds the replies T1/T2 recorded (evidence-*.json slices.modelCalls, pass read)", () => {
  it("recorded 356 answered reads, 48 of them cut at the old 1024 budget and asked again at twice the size", () => {
    expect(outputs).toHaveLength(356);
    expect(outputs.filter(truncated)).toHaveLength(48);
    expect(Math.max(...completed)).toBe(1510);
  });

  it("every completed reply, the 2048 retries of the cut ones included, fits the first ask with a quarter to spare", () => {
    expect(maxTokensFor("sharedRead", 0)).toBe(maxTokensCap("sharedRead"));
    expect(Math.max(...completed)).toBeLessThan(maxTokensCap("sharedRead") * 0.75);
  });

  it("control: at the old budget one read in eight was cut, and the cut ones needed up to 1,510 tokens when asked again", () => {
    expect(outputs.filter(truncated).length / outputs.length).toBeGreaterThan(0.12);
    expect(completed.filter((output) => output > OLD_BUDGET).length).toBeGreaterThan(20);
  });
});
