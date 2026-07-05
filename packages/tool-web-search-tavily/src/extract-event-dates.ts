const ISO_DATE_PATTERN = /\b(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})\b/g;
const CN_FULL_DATE_PATTERN = /(20\d{2})年(\d{1,2})月(\d{1,2})日/g;
const CN_PARTIAL_DATE_PATTERN = /(?<!\d年)(\d{1,2})月(\d{1,2})日/g;
const POSTPONED_PATTERN = /延期|取消|推迟|postponed|cancelled|canceled/i;
const TICKET_SCHEDULE_PATTERN = /时间[:：]|开票|门票|预售|damai|大麦/i;

export function extractEventDates(text: string, defaultYear: number): Date[] {
  const dates = new Set<number>();

  for (const match of text.matchAll(ISO_DATE_PATTERN)) {
    addDate(dates, Number(match[1]), Number(match[2]), Number(match[3]));
  }

  for (const match of text.matchAll(CN_FULL_DATE_PATTERN)) {
    addDate(dates, Number(match[1]), Number(match[2]), Number(match[3]));
  }

  for (const match of text.matchAll(CN_PARTIAL_DATE_PATTERN)) {
    addDate(dates, defaultYear, Number(match[1]), Number(match[2]));
  }

  return [...dates]
    .map((timestamp) => new Date(timestamp))
    .sort((left, right) => left.getTime() - right.getTime());
}

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function extractUpcomingConfirmedDates(text: string, now: Date): Date[] {
  const today = startOfLocalDay(now);

  return extractEventDates(text, now.getFullYear()).filter((date) => {
    const day = startOfLocalDay(date);

    if (day < today) {
      return false;
    }

    return !isDateMarkedPostponed(text, date);
  });
}

/** Higher score = more relevant upcoming schedule information. */
export function scoreUpcomingEventRelevance(text: string, now: Date): number {
  const today = startOfLocalDay(now);
  const upcomingDates = extractUpcomingConfirmedDates(text, now);

  if (upcomingDates.length > 0) {
    const nearest = startOfLocalDay(upcomingDates[0]!);
    const daysUntil = Math.floor((nearest.getTime() - today.getTime()) / 86_400_000);
    let score = 100_000 - daysUntil;

    if (TICKET_SCHEDULE_PATTERN.test(text)) {
      score += 50;
    }

    return score;
  }

  if (extractEventDates(text, now.getFullYear()).some((date) => startOfLocalDay(date) < today)) {
    return 1_000;
  }

  if (/\b20\d{2}\b/.test(text)) {
    return 5_000;
  }

  return 2_000;
}

function isDateMarkedPostponed(text: string, date: Date): boolean {
  if (!POSTPONED_PATTERN.test(text)) {
    return false;
  }

  const month = date.getMonth() + 1;
  const day = date.getDate();
  const windowPattern = new RegExp(
    `(?:${month}月${day}日|${date.getFullYear()}年${month}月${day}日)[\\s\\S]{0,40}?(?:延期|取消|推迟)|(?:延期|取消|推迟)[\\s\\S]{0,40}?(?:${month}月${day}日|${date.getFullYear()}年${month}月${day}日)`,
    "i",
  );

  return windowPattern.test(text) || /宣布延期|已延期|延期举办/.test(text);
}

function addDate(store: Set<number>, year: number, month: number, day: number): void {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return;
  }

  const timestamp = new Date(year, month - 1, day).getTime();

  if (Number.isFinite(timestamp)) {
    store.add(timestamp);
  }
}
