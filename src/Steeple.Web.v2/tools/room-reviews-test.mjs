#!/usr/bin/env node

import {
  appendReviewPage,
  emptyReviewFeed,
  hasMoreReviews,
  reviewCountText,
  reviewDate,
  reviewStars,
} from '../src/ui/roomReviews.js';

let failures = 0;

function expect(label, actual, wanted) {
  const same = JSON.stringify(actual) === JSON.stringify(wanted);
  if (!same) {
    failures += 1;
    console.error(`FAIL  ${label} — got ${JSON.stringify(actual)}, wanted ${JSON.stringify(wanted)}`);
  } else {
    console.log(`ok    ${label}`);
  }
}

const first = appendReviewPage(emptyReviewFeed(2), {
  items: [
    { stars: 5, comment: 'Newest', raterName: 'Ada', createdAtUtc: '2026-09-05T03:00:00Z' },
    { stars: 4, comment: 'Next', raterName: 'Bea', createdAtUtc: '2026-09-04T03:00:00Z' },
  ],
  totalCount: 3,
  page: 1,
  pageSize: 2,
});

expect('the first page keeps endpoint order', first.items.map((item) => item.comment), ['Newest', 'Next']);
expect('the next page follows the page the server answered', first.nextPage, 2);
expect('a partial feed has more reviews', hasMoreReviews(first), true);

const complete = appendReviewPage(first, {
  items: [{ stars: 3, comment: 'Oldest', raterName: 'Cy', createdAtUtc: '2026-09-03T03:00:00Z' }],
  totalCount: 3,
  page: 2,
  pageSize: 2,
});

expect('later pages append without replacing earlier reviews', complete.items.map((item) => item.comment), [
  'Newest',
  'Next',
  'Oldest',
]);
expect('the complete feed has no more page', hasMoreReviews(complete), false);

const exhausted = appendReviewPage(first, {
  items: [],
  totalCount: 3,
  page: 2,
  pageSize: 2,
});
expect('an empty later page cannot leave an endless more control', hasMoreReviews(exhausted), false);
expect('one review is singular', reviewCountText(1), '1 review');
expect('several reviews are plural', reviewCountText(3), '3 reviews');
expect('a review date is stable across local time zones', reviewDate('2026-09-05T23:30:00Z'), 'Sep 5, 2026');
expect('a four-star fact changes both glyph shape and fill', reviewStars(4), '★★★★☆');

console.log(failures === 0 ? '\nreview paging holds together.\n' : `\n${failures} review paging failure(s).\n`);
process.exit(failures === 0 ? 0 : 1);
