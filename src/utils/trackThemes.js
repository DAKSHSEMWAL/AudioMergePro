const TRACK_THEMES = [
  {
    accent: '139, 92, 246',
    accentSoft: '216, 180, 254',
    accentDeep: '109, 40, 217',
    glow: '124, 58, 237',
  },
  {
    accent: '59, 130, 246',
    accentSoft: '147, 197, 253',
    accentDeep: '29, 78, 216',
    glow: '37, 99, 235',
  },
  {
    accent: '20, 184, 166',
    accentSoft: '153, 246, 228',
    accentDeep: '15, 118, 110',
    glow: '13, 148, 136',
  },
  {
    accent: '217, 70, 239',
    accentSoft: '245, 208, 254',
    accentDeep: '168, 85, 247',
    glow: '192, 38, 211',
  },
  {
    accent: '249, 115, 22',
    accentSoft: '254, 215, 170',
    accentDeep: '194, 65, 12',
    glow: '234, 88, 12',
  },
  {
    accent: '234, 179, 8',
    accentSoft: '254, 240, 138',
    accentDeep: '161, 98, 7',
    glow: '202, 138, 4',
  },
];

export const getTrackTheme = (index) => TRACK_THEMES[index % TRACK_THEMES.length];
