// 中国节日配置：公历固定节日 + 农历节日（春节/端午/中秋等）+ 清明、冬至两个节气
// 供签到日历按日期显示节日名称使用

//  公历固定节日（MM-DD） 
const SOLAR_FESTIVALS = {
  '01-01': '元旦',
  '02-14': '情人节',
  '03-05': '学雷锋日',
  '03-08': '妇女节',
  '03-12': '植树节',
  '03-14': '白色情人节',
  '05-01': '劳动节',
  '05-04': '青年节',
  '05-20': '520',
  '06-01': '儿童节',
  '07-01': '建党节',
  '08-01': '建军节',
  '09-10': '教师节',
  '10-01': '国庆节',
  '10-24': '程序员节',
  '12-24': '平安夜',
  '12-25': '圣诞节',
  '12-31': '跨年夜',
}

//  农历节日（M-D） 
const LUNAR_FESTIVALS = {
  '1-1': '春节',
  '1-15': '元宵节',
  '2-2': '龙抬头',
  '3-3': '上巳节',
  '5-5': '端午节',
  '7-7': '七夕节',
  '7-15': '中元节',
  '8-15': '中秋节',
  '9-9': '重阳节',
  '12-8': '腊八节',
  '12-23': '小年',
  '12-24': '小年', // 南方小年
}

//  农历数据表（1900-2100） 
// 每年一个 16 进制数：bit 0-3 闰月月份，bit 4-15 各月大小（1 大月 30 天 / 0 小月 29 天），
// bit 16 闰月大小。取自通用万年历算法，用于公历 ↔ 农历换算。
const LUNAR_INFO = [
  0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2, // 1900-1909
  0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977, // 1910-1919
  0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970, // 1920-1929
  0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950, // 1930-1939
  0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557, // 1940-1949
  0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0, // 1950-1959
  0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0, // 1960-1969
  0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b5a0, 0x195a6, // 1970-1979
  0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570, // 1980-1989
  0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x055c0, 0x0ab60, 0x096d5, 0x092e0, // 1990-1999
  0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5, // 2000-2009
  0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930, // 2010-2019
  0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530, // 2020-2029
  0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45, // 2030-2039
  0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0, // 2040-2049
  0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0, // 2050-2059
  0x0a2e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4, // 2060-2069
  0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0, // 2070-2079
  0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160, // 2080-2089
  0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a2d0, 0x0d150, 0x0f252, // 2090-2099
  0x0d520, // 2100
]

// 某农历年闰哪个月，无闰月返回 0
function leapMonth(year) {
  return LUNAR_INFO[year - 1900] & 0xf
}

// 某农历年闰月的天数（29 / 30），无闰月返回 0
function leapDays(year) {
  if (!leapMonth(year)) return 0
  return LUNAR_INFO[year - 1900] & 0x10000 ? 30 : 29
}

// 某农历年第 month 个月的天数（29 / 30）
function monthDays(year, month) {
  return LUNAR_INFO[year - 1900] & (0x10000 >> month) ? 30 : 29
}

// 某农历年总天数
function lunarYearDays(year) {
  let sum = 348
  for (let i = 0x8000; i > 0x8; i >>= 1) {
    sum += LUNAR_INFO[year - 1900] & i ? 1 : 0
  }
  return sum + leapDays(year)
}

// 公历日期转农历：返回 { year, month, day, isLeap }
function solarToLunar(y, m, d) {
  // 以 1900-01-31（农历正月初一）为基准，按天偏移推算
  const baseDate = Date.UTC(1900, 0, 31)
  const targetDate = Date.UTC(y, m - 1, d)
  let offset = Math.floor((targetDate - baseDate) / 86400000)

  let lunarYear = 1900
  while (lunarYear < 2101 && offset >= lunarYearDays(lunarYear)) {
    offset -= lunarYearDays(lunarYear)
    lunarYear++
  }

  const leap = leapMonth(lunarYear)
  let isLeap = false
  let lunarMonth = 1

  for (lunarMonth = 1; lunarMonth <= 12; lunarMonth++) {
    // 闰月插在对应月份之后
    let days
    if (leap && lunarMonth === leap + 1 && !isLeap) {
      lunarMonth--
      isLeap = true
      days = leapDays(lunarYear)
    } else {
      days = monthDays(lunarYear, lunarMonth)
    }
    if (isLeap && lunarMonth === leap + 1) isLeap = false
    if (offset < days) break
    offset -= days
  }

  return { year: lunarYear, month: lunarMonth, day: offset + 1, isLeap }
}

//  二十四节气（用于清明、冬至） 
// 各节气相对基准的时间偏移（分钟），index 6 = 清明，index 23 = 冬至
const TERM_INFO = [
  0, 21208, 42467, 63836, 85337, 107014, 128867, 150921, 173149, 195551, 218072, 240693,
  263343, 285989, 308563, 331033, 353350, 375494, 397447, 419210, 440795, 462224, 483532,
  504758,
]

function solarTermDay(year, index) {
  const ms = 31556925974.7 * (year - 1900) + TERM_INFO[index] * 60000 + Date.UTC(1900, 0, 6, 2, 5)
  return new Date(ms).getUTCDate()
}

//  对外接口：返回某天的节日名称，没有则返回空字符串 
export function getFestival(year, month, day) {
  const solarKey = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  if (SOLAR_FESTIVALS[solarKey]) return SOLAR_FESTIVALS[solarKey]

  if (month === 4 && day === solarTermDay(year, 6)) return '清明节'
  if (month === 12 && day === solarTermDay(year, 23)) return '冬至'

  // 农历节日（1900-2100 之外不换算）
  if (year < 1900 || year > 2100) return ''
  const lunar = solarToLunar(year, month, day)

  // 除夕：农历十二月的最后一天（廿九或三十）
  if (lunar.month === 12 && !lunar.isLeap && lunar.day === monthDays(lunar.year, 12)) {
    return '除夕'
  }

  const lunarKey = `${lunar.month}-${lunar.day}`
  return LUNAR_FESTIVALS[lunarKey] || ''
}
