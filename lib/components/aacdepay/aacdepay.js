/*
From RFC 3640 https://tools.ietf.org/html/rfc3640
  2.11.  Global Structure of Payload Format

     The RTP payload following the RTP header, contains three octet-
     aligned data sections, of which the first two MAY be empty, see
     Figure 1.

           +---------+-----------+-----------+---------------+
           | RTP     | AU Header | Auxiliary | Access Unit   |
           | Header  | Section   | Section   | Data Section  |
           +---------+-----------+-----------+---------------+

                     <----------RTP Packet Payload----------->

              Figure 1: Data sections within an RTP packet
Note that auxilary section is empty for AAC-hbr

  3.2.1.  The AU Header Section

   When present, the AU Header Section consists of the AU-headers-length
   field, followed by a number of AU-headers, see Figure 2.

      +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+- .. -+-+-+-+-+-+-+-+-+-+
      |AU-headers-length|AU-header|AU-header|      |AU-header|padding|
      |                 |   (1)   |   (2)   |      |   (n)   | bits  |
      +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+- .. -+-+-+-+-+-+-+-+-+-+

                   Figure 2: The AU Header Section
*/

const {Rtp} = require('../../utils/protocols')
const {ELEMENTARY} = require('../messageTypes')

module.exports = function aacDepay (rtp, hasHeader, callback) {
  const buffer = Rtp.payload(rtp.data)

  let headerLength = 0
  if (hasHeader) {
    const auHeaderLengthInBits = buffer.readUInt16BE(0)
    headerLength = 2 + (auHeaderLengthInBits + auHeaderLengthInBits % 8) / 8 // Add padding
  }
  const packet = {
    data: buffer.slice(headerLength),
    payloadType: Rtp.payloadType(rtp.data),
    timestamp: Rtp.timestamp(rtp.data),
    ntpTimestamp: rtp.ntpTimestamp,
    type: ELEMENTARY
  }

  callback(packet)
}
