// Notification-copy regression tests, in plain node.
//   node tools/notifications-test.mjs

const { actionLabelFor, isAmbient, lineFor } = await import('../src/ui/notifications.js');

let failures = 0;
function expect(label, actual, wanted) {
  if (actual !== wanted) {
    failures++;
    console.error(`FAIL  ${label} — got ${JSON.stringify(actual)}`);
  } else {
    console.log(`ok    ${label}`);
  }
}

const approval = {
  type: 'listingApproved',
  payload: {
    roomName: 'Fellowship Hall',
    venueName: 'Trinity Community Centre',
    deepLink: '/space/trinity-community-centre/fellowship-hall',
  },
};

const bookingApproval = {
  type: 'applicationApproved',
  payload: {
    roomName: 'Fellowship Hall',
    venueName: 'Trinity Community Centre',
    messageAdded: true,
    deepLink: '/inbox/applications/application-1',
  },
};

const message = {
  type: 'applicationMessage',
  payload: {
    roomName: 'Fellowship Hall',
    venueName: 'Trinity Community Centre',
    senderName: 'Trinity Community Centre',
    deepLink: '/inbox/applications/application-1',
  },
};

expect(
  'an approved listing has host-facing copy',
  lineFor(approval),
  'Your listing is live — Fellowship Hall at Trinity Community Centre can now be found and booked.'
);
expect('an approved listing is surfaced in the inbox', isAmbient(approval), true);
expect('the approval slip links onward in the host\u2019s words', actionLabelFor(approval), 'View your listing');
expect(
  'approval copy remains useful with an older sparse payload',
  lineFor({ type: 'listingApproved', payload: {} }),
  'Your listing is live — your space can now be found and booked.'
);
expect(
  'a booking approval states the outcome and the host reply',
  lineFor(bookingApproval),
  'Your booking is confirmed — Fellowship Hall at Trinity Community Centre. There\u2019s also a message from Trinity Community Centre.'
);
expect('a booking approval is surfaced in the inbox', isAmbient(bookingApproval), true);
expect(
  'the combined approval opens both facts together',
  actionLabelFor(bookingApproval),
  'See booking & message'
);
expect(
  'a standalone message names its sender and request',
  lineFor(message),
  'Trinity Community Centre sent you a message about Fellowship Hall at Trinity Community Centre.'
);
expect('a standalone message is surfaced in the inbox', isAmbient(message), true);
expect('a standalone message opens the thread', actionLabelFor(message), 'Read message');
expect(
  'an older message payload is still clear without guessing the sender',
  lineFor({ type: 'applicationMessage', payload: { roomName: 'Fellowship Hall' } }),
  'There\u2019s a new message about Fellowship Hall.'
);
expect(
  'a decline is not silently buried in the request row',
  lineFor({ type: 'applicationDeclined', payload: { roomName: 'Fellowship Hall' } }),
  'Your request for Fellowship Hall wasn\u2019t accepted.'
);

console.log(`\n${12 - failures}/12 checks passed`);
process.exit(failures ? 1 : 0);
