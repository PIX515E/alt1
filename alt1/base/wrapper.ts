import * as ImageDetect from "./imagedetect";
import Rect, { RectLike } from "./rect";
import { ImgRefBind, ImgRefCtx, ImgRefData, ImgRef } from "./imgref";
import "./imagedata-extensions";

declare global {
	namespace alt1 {
		var events: { [event: string]: Alt1EventHandler[] };
	}
}

/**
 * Thrown when a method is called that can not be used outside of Alt1
 */
export class NoAlt1Error extends Error {
	constructor() {
		super();
		this.message = "This method can not be ran outside of Alt1";
	}
};
/**
 * Thrown when the Alt1 API returns an invalid result
 * Errors of a different type are throw when internal Alt1 errors occur
 */
export class Alt1Error extends Error { }

/**
 * The latest Alt1 version
 */
export var newestversion = "1.4.6";

/**
 * Wether the Alt1 API is available
 */
export var hasAlt1 = (typeof alt1 != "undefined");

/**
 * The name of the Alt1 interface skin. (Always "default" if running in a browser)
 */
export var skinName = hasAlt1 ? alt1.skinName : "default";

/**
 * Max number of bytes that can be sent by alt1 in one function
 * Not completely sure why this number is different than window.alt1.maxtranfer
 */
var maxtransfer = 4000000;

/**
 * Recommended minimal capture interval
 */
var trackinterval = (hasAlt1 && alt1.captureInterval) || 300;

/**
 * Open a link in the default browser
 * @deprecated use window.open instead
 */
export function openbrowser(url:string) {
	if (hasAlt1) {
		alt1.openBrowser(url);
	}
	else {
		window.open(url, '_blank');
	}
}

/**
 * Throw if Alt1 API is not available
 */
export function requireAlt1() {
	if (!hasAlt1) { throw new NoAlt1Error(); }
}

/**
 * Returns an object with a rectangle that spans all screens
 */
export function getdisplaybounds() {
	if (!hasAlt1) { return false; }
	return new Rect(alt1.screenX, alt1.screenY, alt1.screenWidth, alt1.screenHeight);
}

/**
 * gets an imagebuffer with pixel data about the requested region
 */
export function capture(x: number, y: number, w: number, h: number): ImageData;
export function capture(rect: RectLike): ImageData;
export function capture(...args:any[]): ImageData|null {
	if (!hasAlt1) { throw new NoAlt1Error(); }
	var i = 0;

	var rect = Rect.fromArgs(...args);

	var buf = new ImageData(rect.width, rect.height);

	if (rect.width * rect.height * 4 <= maxtransfer) {
		var data = alt1.getRegion(rect.x, rect.y, rect.width, rect.height);
		if (!data) { return null; }
		decodeImageString(data, buf, 0, 0, rect.width, rect.height);
	}
	else {
		//split up the request to to exceed the single transfer limit (for now)
		var x1 = rect.x;
		var ref = alt1.bindRegion(rect.x, rect.y, rect.width, rect.height);
		if (ref <= 0) { return null; }
		while (x1 < rect.x + rect.width) {
			var x2 = Math.min(rect.x + rect.width, Math.floor(x1 + (maxtransfer / 4 / rect.height)));
			var data = alt1.bindGetRegion(ref, x1, rect.y, x2 - x1, rect.height);
			if (!data) { return null; }
			decodeImageString(data, buf, x1 - rect.x, 0, x2 - x1, rect.height);
			x1 = x2;
		}
	}
	return buf;
}

/**
 * Makes alt1 bind an area of the rs client in memory without sending it to the js client
 * returns an imgref object which can be used to get pixel data using the imgreftobuf function
 * currently only one bind can exist per app and the ref in (v) will always be 1
 */
export function captureHold(x: number, y: number, w: number, h: number) {
	x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
	requireAlt1();
	var r = alt1.bindRegion(x, y, w, h);
	if (r <= 0) { throw new Alt1Error("capturehold failed"); }
	return new ImgRefBind(r, x, y, w, h);
}

/**
 * Same as captureHoldRegion, but captures the screen instead of the rs client. it also uses screen coordinates instead and can capture outside of the rs client
 */
export function captureHoldScreen(x: number, y: number, w: number, h: number) {
	x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
	requireAlt1();
	var r = alt1.bindScreenRegion(x, y, w, h);
	if (r <= 0) { return false; }
	return new ImgRefBind(r, x, y, w, h);
}

/**
 * bind the full rs window if the rs window can be detected by alt1, otherwise return the full screen
 */
export function captureHoldFullRs() {
	return captureHold(0, 0, alt1.rsWidth, alt1.rsHeight);
}

/**
 * returns a subregion from a bound image
 * used internally in imgreftobuf if imgref is a bound image
 * @deprecated This should be handled internall by the imgrefbind.toData method
 */
export function transferImageData(handle: number, x: number, y: number, w: number, h: number) {
	x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
	requireAlt1();

	var r = new ImageData(w, h);

	var x1 = x;
	while (true) {//split up the request to to exceed the single transfer limit (for now)
		var x2 = Math.min(x + w, Math.floor(x1 + (maxtransfer / 4 / h)));
		var a = alt1.bindGetRegion(handle, x1, y, x2 - x1, h);
		if (!a) { throw new Alt1Error(); }
		decodeImageString(a, r, x1 - x, 0, x2 - x1, h);
		x1 = x2;
		if (x1 == x + w) { break; };
	}
	return r;
}

/**
 * decodes a returned string from alt1 to an imagebuffer
 */
export function decodeImageString(imagestring: string, target: ImageData, x: number, y: number, w: number, h: number) {
	var bin = atob(imagestring);

	var bytes = target.data;

	w |= 0;
	h |= 0;
	var offset = 4 * x + 4 * y * target.width;
	for (var a = 0; a < w; a++) {
		for (var b = 0; b < h; b++) {
			var i1 = (offset + (a * 4 | 0) + (b * target.width * 4 | 0)) | 0;
			var i2 = ((a * 4 | 0) + (b * 4 * w | 0)) | 0;
			bytes[i1 + 0 | 0] = bin.charCodeAt(i2 + 2 | 0);//fix weird red/blue swap in c#
			bytes[i1 + 1 | 0] = bin.charCodeAt(i2 + 1 | 0);
			bytes[i1 + 2 | 0] = bin.charCodeAt(i2 + 0 | 0);
			bytes[i1 + 3 | 0] = bin.charCodeAt(i2 + 3 | 0);
		}
	}
	return target;
}

/**
 * encodes an imagebuffer to a string
 */
export function encodeImageString(buf: ImageData, sx = 0, sy = 0, sw = buf.width, sh = buf.height) {
	var raw = "";
	for (var y = sy; y < sy + sh; y++) {
		for (var x = sx; x < sx + sw; x++) {
			var i = 4 * x + 4 * buf.width * y | 0;
			raw += String.fromCharCode(buf.data[i + 2 | 0]);
			raw += String.fromCharCode(buf.data[i + 1 | 0]);
			raw += String.fromCharCode(buf.data[i + 0 | 0]);
			raw += String.fromCharCode(buf.data[i + 3 | 0]);
		}
	}
	return btoa(raw);
}

/**
 * mixes the given color into a single int. This format is used by alt1
 */
export function mixColor(r: number, g: number, b: number, a = 255) {
	return (b << 0) + (g << 8) + (r << 16) + (a << 24);
}


export function identifyApp(url: string) {
	if (hasAlt1) { alt1.identifyAppUrl(url); }
}

function convertAlt1Version(str: string) {
	var a = str.match(/^(\d+)\.(\d+)\.(\d+)$/);
	if (!a) { throw new RangeError("Invalid version string"); }
	return (+a[1]) * 1000 * 1000 + (+a[2]) * 1000 + (+a[3]) * 1;
}

/**
 * checks if alt1 is running and at least the given version. versionstr should be a string with the version eg: 1.3.2
 * @param versionstr
 */
export function hasAlt1Version(versionstr: string) {
	if (!hasAlt1) { return false; }
	return alt1.versionint >= convertAlt1Version(versionstr);
}

/**
 * Gets the current cursor position in the game, returns null if the rs window is not active (alt1.rsActive)
 */
export function getMousePosition() {
	var pos = alt1.mousePosition;
	if (pos == -1) { return null; }
	return { x: pos >>> 16, y: pos & 0xFFFF };
}
/**
 * Registers a given HTML element as a frame border, when this element is dragged by the user the Alt1 frame will resize accordingly
 * Use the direction arguements to make a given direction stick to the mouse. eg. Only set left to true to make the element behave as the left border
 * Or set all to true to move the whole window. Not all combinations are permitted
 */
export function addResizeElement(el: HTMLElement, left: boolean, top: boolean, right: boolean, bot: boolean) {
	if (!hasAlt1 || !alt1.userResize) { return; }
	el.addEventListener("mousedown", function (e) {
		alt1.userResize(left, top, right, bot);
		e.preventDefault();
	});
}



export type Alt1EventHandler = (e: any) => void;

/**
 * Add an event listener
 */
export function on<K extends keyof Alt1EventType>(type: K, listener: (ev: Alt1EventType[K]) => void) {
	requireAlt1();
	if (!alt1.events) { alt1.events = {}; }
	if (!alt1.events[type]) { alt1.events[type] = []; }
	alt1.events[type].push(listener);
}

/**
 * Removes an event listener
 */
export function removeListener<K extends keyof Alt1EventType>(type: K, listener: (ev: Alt1EventType[K]) => void) {
	var elist = alt1.events && alt1.events[type];
	if (!elist) { return; }
	var i = elist.indexOf(listener);
	if (i == -1) { return; }
	elist.splice(i, 1);
}

/**
 * Listens for the event to fire once and then stops listening
 * @param event
 * @param cb
 */
export function once<K extends keyof Alt1EventType>(type: K, listener: (ev: Alt1EventType[K]) => void) {
	requireAlt1();
	var fn = (e:Alt1EventType[K]) => {
		removeListener(type, fn);
		listener(e);
	};
	on(type, fn);
}
interface Alt1EventType {
	"alt1pressed": { eventName: "alt1pressed", text: string, mouseAbs: { x: number, y: number }, mouseRs: { x: number, y: number }, x: number, y: number, rsLinked: boolean },
	"menudetected": { eventName: "menudetected", rectangle: { x: number, y: number, width: number, height: number } },
	"rslinked": { eventName: "rslinked" },
	"rsunlinked": { eventName: "rsunlinked" },
	"permissionchanged": { eventName: "permissionchanged" },
	"daemonrun": { eventName: "daemonrun", result: { now: number, nextRun: number, state: string, messages: { [id: string]: { title: string, body: string } }, statusXml: string } },
	"userevent": { eventName: "userevent", argument: string },
	"rsfocus": { eventName: "rsfocus" },
	"rsblur": { eventName: "rsblur" },
};

/**
 * Used to read a set of images from a binary stream returned by the Alt1 API
 */
export class ImageStreamReader {
	private framebuffer: ImageData;
	private streamreader: ReadableStreamReader;
	private pos = 0;
	private reading = false;
	closed = false;

	//paused state
	private pausedindex = -1;
	private pausedbuffer: Uint8Array|null=null;

	constructor(reader: ReadableStreamReader, width: number, height: number);
	constructor(reader: ReadableStreamReader, framebuffer: ImageData);
	constructor(reader: ReadableStreamReader, ...args:any[]) {
		this.streamreader = reader;
		if (args[0] instanceof ImageData) { this.framebuffer = args[0]; }
		else { this.framebuffer = new ImageData(args[0], args[1]); }
	}

	/**
	 * Closes the underlying stream and ends reading
	 */
	close() {
		this.streamreader.cancel();
	}

	/**
	 * Reads a single image from the stream
	 */
	async nextImage() {
		if (this.reading) { throw new Error("already reading from this stream"); }
		this.reading = true;
		var synctime = -Date.now();
		var starttime = Date.now();
		var r = false;
		while (!r) {
			if (this.pausedindex != -1 && this.pausedbuffer) {
				r = this.readChunk(this.pausedindex, this.framebuffer.data, this.pausedbuffer);
			}
			else {
				synctime += Date.now();
				var res = await this.streamreader.read() as { value: Uint8Array, done: boolean };
				synctime -= Date.now();
				if (res.done) { throw new Error("Stream closed while reading"); }
				var data = res.value;
				r = this.readChunk(0, this.framebuffer.data, data);
			}
		}
		synctime += Date.now();
		//console.log("Decoded async image, " + this.framebuffer.width + "x" + this.framebuffer.height + " time: " + (Date.now() - starttime) + "ms (" + synctime + "ms main thread)");
		this.reading = false;
		return this.framebuffer;
	}

	private readChunk(i: number, framedata: Uint8ClampedArray, buffer: Uint8Array) {
		//very hot code, explicit int32 casting with |0 speeds it up by ~ x2
		i = i | 0;
		var framesize = framedata.length | 0;
		var pos = this.pos;
		var datalen = buffer.length | 0;
		//var data32 = new Float64Array(buffer.buffer);
		//var framedata32 = new Float64Array(framedata.buffer);

		//fix possible buffer misalignment
		//align to 16 for extra loop unrolling
		while (i < datalen) {
			//slow loop, fix alignment and other issues
			while (i < datalen && pos < framesize && (pos % 16 != 0 || !((i + 16 | 0) <= datalen && (pos + 16 | 0) <= framesize))) {
				var rel = pos;
				if (pos % 4 == 0) { rel = rel + 2 | 0; }
				if (pos % 4 == 2) { rel = rel - 2 | 0; }
				framedata[rel | 0] = buffer[i | 0];
				i = i + 1 | 0;
				pos = pos + 1 | 0;
			}

			//fast unrolled loop for large chunks i wish js had some sort of memcpy
			if (pos % 16 == 0) {
				while ((i + 16 | 0) <= datalen && (pos + 16 | 0) <= framesize) {
					framedata[pos + 0 | 0] = buffer[i + 2 | 0];
					framedata[pos + 1 | 0] = buffer[i + 1 | 0];
					framedata[pos + 2 | 0] = buffer[i + 0 | 0];
					framedata[pos + 3 | 0] = buffer[i + 3 | 0];

					framedata[pos + 4 | 0] = buffer[i + 6 | 0];
					framedata[pos + 5 | 0] = buffer[i + 5 | 0];
					framedata[pos + 6 | 0] = buffer[i + 4 | 0];
					framedata[pos + 7 | 0] = buffer[i + 7 | 0];

					framedata[pos + 8 | 0] = buffer[i + 10 | 0];
					framedata[pos + 9 | 0] = buffer[i + 9 | 0];
					framedata[pos + 10 | 0] = buffer[i + 8 | 0];
					framedata[pos + 11 | 0] = buffer[i + 11 | 0];

					framedata[pos + 12 | 0] = buffer[i + 14 | 0];
					framedata[pos + 13 | 0] = buffer[i + 13 | 0];
					framedata[pos + 14 | 0] = buffer[i + 12 | 0];
					framedata[pos + 15 | 0] = buffer[i + 15 | 0];

					//could speed it up another x2 but wouldn't be able to swap r/b swap and possible alignment issues
					//framedata32[pos / 8 + 0 | 0] = data32[i / 8 + 0 | 0];
					//framedata32[pos / 8 + 1 | 0] = data32[i / 8 + 1 | 0];
					//framedata32[pos / 4 + 2 | 0] = data32[i / 4 + 2 | 0];
					//framedata32[pos / 4 + 3 | 0] = data32[i / 4 + 3 | 0];

					pos = pos + 16 | 0;
					i = i + 16 | 0;
				}
			}

			if (pos >= framesize) {
				this.pausedbuffer = null;
				this.pausedindex = -1;

				this.pos = 0;
				if (i != buffer.length - 1) {
					this.pausedbuffer = buffer;
					this.pausedindex = i;
				}
				return true;
			}
		}
		this.pos = pos;
		this.pausedbuffer = null;
		this.pausedindex = -1;
		return false;
	}
}

type asyncCaptureFormat = "png" | "raw" | "jpeg";

/**
 * Asynchronously captures a section of the game screen
 */
export async function captureAsync(rect: RectLike, format?: asyncCaptureFormat, quality?: number): Promise<ImageData>;
export async function captureAsync(x: number, y: number, width: number, height: number, format?: asyncCaptureFormat, quality?: number): Promise<ImageData>;
export async function captureAsync(...args:any[]): Promise<ImageData> {
	requireAlt1();
	var i = 0;
	var rect = (typeof args[i] == "object" ? args[i++] : { x: args[i++], y: args[i++], width: args[i++], height: args[i++] });
	var format = args[i++] || "raw";
	var quality = args[i++] || 0.6;

	if (!hasAlt1Version("1.4.6")) {
		return capture(rect.x, rect.y, rect.width, rect.height);
	}
	var url = "https://alt1api/pixel/getregion/" + encodeURIComponent(JSON.stringify({ ...rect, format, quality }));
	if (format == "raw") {
		var res = await fetch(url);
		var imgreader = new ImageStreamReader(res.body!.getReader(), rect.width, rect.height);
		return imgreader.nextImage();
	} else {
		return ImageDetect.imageDataFromUrl(url);
	}
}

export type CaptureStreamResult = { x: number, y: number, width: number, height: number, framenr: number, close: () => void, closed: boolean };

/**
 * Starts capturing a realtime stream of the game. Make sure you keep reading the stream and close it when you're done or Alt1 WILL crash
 * @param framecb Called whenever a new frame is decoded
 * @param errorcb Called whenever an error occurs, the error is rethrown if not defined
 * @param fps Maximum fps of the stream
 */
export function captureStream(x: number, y: number, width: number, height: number, fps: number, framecb: (img: ImageData) => void, errorcb?: (e: Error) => void): CaptureStreamResult {
	requireAlt1();
	if (!hasAlt1Version("1.4.6")) { throw new Alt1Error("This function is not supported in this version of Alt1"); }
	var url = "https://alt1api/pixel/streamregion/" + encodeURIComponent(JSON.stringify({ x, y, width, height, fps, format: "raw" }));
	var res = fetch(url).then(async res => {
		var reader = new ImageStreamReader(res.body!.getReader(), width, height);
		try {
			while (!reader.closed && !state.closed) {
				var img = await reader.nextImage();
				if (!state.closed) {
					framecb(img);
					state.framenr++;
				}
			}
		} catch (e) {
			if (!state.closed) {
				reader.close();
				if (errorcb) { errorcb(e); }
				else { throw e; }
			}
		}
		if (!reader.closed && state.closed) {
			reader.close();
		}
	});
	var state = {
		x, y, width, height,
		framenr: 0,
		close: () => { state.closed = true; },
		closed: false,
	};
	return state;
}
