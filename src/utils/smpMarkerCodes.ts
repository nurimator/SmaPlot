const SYM_ENTRIES: Array<[number, string]> = [
  [0, 'no_dot'],
  [1, 'filled_circle'],
  [2, 'circle'],
  [3, 'filled_triangle'],
  [4, 'triangle'],
  [5, 'filled_square'],
  [6, 'square'],
  [7, 'filled_triangle_down'],
  [8, 'triangle_down'],
  [9, 'filled_diamond'],
  [10, 'diamond'],
  [11, 'plus'],
  [12, 'cross'],
  [13, 'vbar'],
  [14, 'circle_inner'],
  [15, 'triangle_inner'],
  [16, 'square_inner'],
  [17, 'triangle_down_inner'],
  [18, 'diamond_inner'],
  [19, 'half_circle'],
  [20, 'half_triangle'],
  [21, 'half_square'],
  [22, 'half_triangle_down'],
  [23, 'half_diamond'],
  [24, 'diag_a'],
  [25, 'diag_b'],
  [26, 'hbar'],
  [27, 'box_error'],
  [28, 'diag_error'],
  [33, 'step_h'],
  [34, 'step_v'],
  [38, 'hexagon'],
  [39, 'pentagon_down'],
  [40, 'pentagon_up'],
  [41, 'star'],
  [42, 'circle_plus'],
  [43, 'circle_cross'],
  [44, 'half_circle_fill'],
  [45, 'triangle_half_fill'],
  [46, 'square_half_fill'],
  [47, 'triangle_down_half_fill'],
  [48, 'diamond_half_fill'],
  [49, 'circle_whisker_r'],
  [50, 'circle_whisker_d'],
  [51, 'circle_whisker_l'],
  [52, 'circle_whisker_u'],
]

export const SYM_CODE_TO_PLOT: Record<number, string> = Object.fromEntries(SYM_ENTRIES)

export const PLOT_TO_SYM_CODE: Record<string, number> = Object.fromEntries(
  SYM_ENTRIES.map(([code, name]): [string, number] => [name, code])
)

export const DIAMOND_FAMILY = new Set([
  'diamond',
  'filled_diamond',
  'diamond_inner',
  'half_diamond',
  'diamond_half_fill',
])

export const TRIANGLE_FAMILY = new Set([
  'triangle',
  'filled_triangle',
  'triangle_down',
  'filled_triangle_down',
  'triangle_inner',
  'triangle_down_inner',
  'half_triangle',
  'half_triangle_down',
  'triangle_half_fill',
  'triangle_down_half_fill',
])

if (
  Object.keys(SYM_CODE_TO_PLOT).length !== SYM_ENTRIES.length ||
  Object.keys(PLOT_TO_SYM_CODE).length !== SYM_ENTRIES.length
) {
  throw new Error('smpMarkerCodes: duplicate sym code or plotType name')
}
