const {Readable, Writable} = require('stream')

const Component = require('../component')
const {Rtcp} = require('../../utils/protocols')
const {ISOM, SDP, RTCP} = require('../messageTypes')

const TRIGGER_THRESHOLD = 100

class MseComponent extends Component {
  /**
   * Create a Media component.
   *
   * The constructor sets up two streams and connects them to the MediaSource.
   *
   * @param {MediaSource} mse - A media source.
   */
  constructor (el) {
    if (el === undefined) {
      throw new Error('video element argument missing')
    }

    let mse
    let sourceBuffer

    /**
     * Set up an incoming stream and attach it to the sourceBuffer.
     * @type {Writable}
     */
    const incoming = new Writable({
      objectMode: true,
      write: (msg, encoding, callback) => {
        if (msg.type === SDP) {
          // Start a new movie (new SDP info available)

          // Set up a list of tracks that contain info about
          // the type of media, encoding, and codec are present.
          const tracks = msg.sdp.media.map((media) => {
            return {
              type: media.type,
              encoding: media.rtpmap.encodingName,
              mime: media.mime,
              codec: media.codec
            }
          })

          // Start a new mediaSource and prepare it with a sourceBuffer.
          // When ready, this component's .onSourceOpen callback will be called
          // with the mediaSource, and a list of valid/ignored media.
          mse = new window.MediaSource()
          el.src = window.URL.createObjectURL(mse)
          const handler = () => {
            mse.removeEventListener('sourceopen', handler)
            this.onSourceOpen && this.onSourceOpen(mse, tracks)
            const mimeCodecs = tracks.map((track) => track.mime).filter((mime) => mime).join(', ')
            sourceBuffer = this.addSourceBuffer(el, mse, `video/mp4; codecs="${mimeCodecs}"`)
            callback()
          }
          mse.addEventListener('sourceopen', handler)
        } else if (msg.type === ISOM) {
          // ISO BMFF Byte Stream data to be added to the source buffer
          this._done = callback
          try {
            sourceBuffer.appendBuffer(msg.data)
          } catch (e) {
            // do nothing
          }
        } else if (msg.type === RTCP) {
          if (Rtcp.packetType(msg.data) === Rtcp.BYE.packetType) {
            mse.readyState === 'open' && mse.endOfStream()
          }
          callback()
        } else if (this._handlers[msg.type]) {
          // If a message type has a callback registered, invoke it
          this._handlers[msg.type](msg)
          callback()
        } else {
          callback()
        }
      }
    })

    incoming.on('finish', () => {
      mse && mse.readyState === 'open' && mse.endOfStream()
    })

    // When an error is sent on the incoming stream, close it.
    incoming.on('error', () => {
      if (sourceBuffer.updating) {
        sourceBuffer.addEventListener('updateend', () => {
          mse.readyState === 'open' && mse.endOfStream()
        })
      } else {
        mse.readyState === 'open' && mse.endOfStream()
      }
    })

    /**
     * Set up outgoing stream.
     * @type {Writable}
     */
    const outgoing = new Readable({
      objectMode: true,
      read () {
        //
      }
    })

    // When an error is sent on the outgoing stream, whine about it.
    outgoing.on('error', () => {
      console.warn('outgoing stream broke somewhere')
    })

    /**
    * initialize the component.
    */
    super(incoming, outgoing)
    this._handlers = {}
  }

  /**
   * Adds a callback for a specified message type. Replaces any existing callback
   * of the same type.
   * @param {String} type - The name of the message type.
   * @param {Function} cb - The callback function associated with the message type.
   */
  registerHandler (messageType, cb) {
    this._handlers[messageType] = cb
  }

  /**
   * Removes the callback handler for the specified message type if it exists. Throws an error
   * otherwise.
   * @param {String} type - The name of the message type.
   */
  unregisterHandler (messageType) {
    if (!this._handlers[messageType]) {
      throw new Error(`Cannot unregister handler for type "${messageType}" because it does
        not exist.`)
    }
    delete this._handlers[messageType]
  }

  /**
   * Add a new sourceBuffer to the mediaSource and remove old ones.
   * @param {HTMLMediaElement} el  The media element holding the media source.
   * @param {MediaSource} mse  The media source the buffer should be attached to.
   * @param {String} [mimeType='video/mp4; codecs="avc1.4D0029, mp4a.40.2"'] [description]
   */
  addSourceBuffer (el, mse, mimeType) {
    const sourceBuffer = mse.addSourceBuffer(mimeType)

    let trigger = 0
    const onUpdateEndHandler = () => {
      ++trigger

      if (trigger > TRIGGER_THRESHOLD && sourceBuffer.buffered.length) {
        trigger = 0

        const index = sourceBuffer.buffered.length - 1
        const start = sourceBuffer.buffered.start(index)
        const end = el.currentTime - 10
        try {
          // remove all material up to 10 seconds before current time
          if (end > start) {
            sourceBuffer.remove(start, end)

            return // this._done() will be called on the next updateend event!
          }
        } catch (e) {
          console.warn(e)
        }
      }
      this._done()
    }
    sourceBuffer.addEventListener('updateend', onUpdateEndHandler)

    return sourceBuffer
  }
}

module.exports = MseComponent
