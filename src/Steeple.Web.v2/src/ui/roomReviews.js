import { el } from './dom.js';

/** @typedef {{stars:number,comment?:string|null,raterName:string,createdAtUtc:string}} Review */
/** @typedef {{items:Array<Review>,loadedCount:number,totalCount:number,nextPage:number,pageSize:number,exhausted:boolean}} ReviewFeed */

const REVIEW_DATE = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** @returns {ReviewFeed} */
export const emptyReviewFeed = (pageSize = 10) => ({
  items: [],
  loadedCount: 0,
  totalCount: 0,
  nextPage: 1,
  pageSize,
  exhausted: false,
});

/**
 * @param {ReviewFeed} feed
 * @param {{items?:Array<Review>,totalCount?:number,page?:number,pageSize?:number}} page
 * @returns {ReviewFeed}
 */
export function appendReviewPage(feed, page) {
  const items = Array.isArray(page?.items) ? page.items : [];
  const answeredPage = typeof page?.page === 'number' && Number.isInteger(page.page)
    ? page.page
    : feed.nextPage;
  return {
    items: [...feed.items, ...items],
    loadedCount: feed.loadedCount + items.length,
    totalCount:
      typeof page?.totalCount === 'number' && Number.isInteger(page.totalCount)
        ? page.totalCount
        : feed.totalCount,
    nextPage: answeredPage + 1,
    pageSize:
      typeof page?.pageSize === 'number' && Number.isInteger(page.pageSize)
        ? page.pageSize
        : feed.pageSize,
    exhausted: items.length === 0,
  };
}

/** @param {ReviewFeed} feed */
export const hasMoreReviews = (feed) => !feed.exhausted && feed.loadedCount < feed.totalCount;

/** @param {number} count */
export const reviewCountText = (count) => `${count} ${count === 1 ? 'review' : 'reviews'}`;

/** @param {string} value */
export function reviewDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : REVIEW_DATE.format(date);
}

/** @param {number} value */
export function reviewStars(value) {
  const stars = Math.max(1, Math.min(5, Math.round(Number(value))));
  return `${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}`;
}

/**
 * @param {Review} review
 * @param {boolean} last
 */
function reviewRow(review, last) {
  const stars = Math.max(1, Math.min(5, Math.round(Number(review.stars))));
  const glyphs = reviewStars(stars);
  const date = reviewDate(review.createdAtUtc);
  return el(
    'li',
    {
      class: 'review',
      ...(last ? { tabindex: '-1', dataset: { reviewEnd: '' } } : {}),
    },
    [
      el('p', { class: 'review__fact' }, [
        el('span', { 'aria-hidden': 'true' }, [
          el('span', { class: 'review__name', text: review.raterName }),
          el('span', { class: 'review__stars' }, [
            el('span', { class: 'review__stars-lit', text: glyphs.slice(0, stars) }),
            el('span', { class: 'review__stars-unlit', text: glyphs.slice(stars) }),
          ]),
          date && el('time', { class: 'review__date', datetime: review.createdAtUtc, text: date }),
        ]),
        el('span', {
          class: 'visually-hidden',
          text: `Review by ${review.raterName}. ${stars} out of 5 stars.${date ? ` ${date}.` : ''}`,
        }),
      ]),
      el('p', { class: 'prose prose--sm review__comment', text: review.comment }),
    ]
  );
}

/**
 * @param {ReviewFeed} feed
 * @param {{failed:boolean,loading:boolean,more:boolean,onMore:()=>void}} state
 */
export function reviewSection(feed, { failed, loading, more, onMore }) {
  if (feed.items.length === 0) return null;

  const control = failed || more || loading
    ? el('div', { class: 'reviews__paging' }, [
        failed &&
          el('p', {
            class: 'reviews__problem',
            role: 'status',
            text: "More reviews couldn't be loaded.",
          }),
        el(
          'button',
          {
            type: 'button',
            class: 'pill reviews__more',
            dataset: { reviewAction: 'page' },
            'aria-disabled': loading ? 'true' : null,
            'aria-busy': loading ? 'true' : null,
            onclick: onMore,
          },
          [loading ? 'Loading reviews' : failed ? 'Try again' : 'More reviews']
        ),
      ])
    : null;

  return el('section', { class: 'block reviews', dataset: { reviewCount: String(feed.items.length) } }, [
    el('h2', { class: 'eyebrow', 'aria-label': reviewCountText(feed.totalCount), text: 'Reviews' }),
    el(
      'ul',
      { class: 'reviews__list' },
      feed.items.map((review, index) => reviewRow(review, index === feed.items.length - 1))
    ),
    control,
  ]);
}
