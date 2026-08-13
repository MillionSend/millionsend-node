// MillionSend Node.js SDK — under active development.
// The published API will mirror the shape you already know:
//   const millionsend = new MillionSend(process.env.MILLIONSEND_API_KEY);
//   await millionsend.emails.send({ from, to, subject, html });
// Follow https://github.com/MillionSend for progress.
class MillionSend {
  constructor() {
    throw new Error(
      'The MillionSend SDK is under active development — this placeholder release only reserves the package name. Follow https://github.com/MillionSend for the first working release.'
    );
  }
}
module.exports = { MillionSend };
module.exports.default = MillionSend;
