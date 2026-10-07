/// PIN hashes made by the API's own code (services/api/src/crypto.ts, Node's scrypt), so the
/// POS is tested against exactly what the server sends in the roster.
const nodePinHashes = [
  (pin: '4821', hash: r'scrypt$16384$8$1$ebAWu4Ay3DpWpsFyk_K9yQ$r9Q21EkeGXIqYwJZ-OXsedQ7Uz_CFrl6r8yFIgAKq3Q'),
  (pin: '000000', hash: r'scrypt$16384$8$1$MtuUtp0VaLjtMVG1AnCJBw$BF7YofG08HUw8g0Gta1ZuU5u9liPJtwLkfO-64tK-2E'),
  (pin: '1234', hash: r'scrypt$16384$8$1$jIFLbTBPi5c0BrEpqlgMRA$oLsJMX1N53QVcqQTSQjTc0jAape5bOkh-8UMdtTx2X4'),
];
