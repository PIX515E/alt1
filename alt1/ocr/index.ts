import { ImageData } from "@alt1/base";

export type Charinfo = { width: number, chr: string, bonus: number, secondary: boolean, pixels: number[] };
export type FontDefinition = { chars: Charinfo[], width: number, spacewidth: number, shadow: boolean, height: number, basey: number, minrating?: number };
type ColortTriplet = number[];

export var debug = {
	printcharscores: false,
	trackread: false
};

type Chardebug = { chr: string, rawscore: number, score: number, img: ImageData };
export var debugout = {} as { [id: string]: Chardebug[] };

/**
 * draws the font definition to a buffer and displays it in the dom for debugging purposes
 * @param font
 */
export function debugFont(font: FontDefinition) {
	var spacing = font.width + 2;
	var buf = new ImageData(spacing * font.chars.length, font.height + 1);
	for (var a = 0; a < buf.data.length; a += 4) {
		buf.data[a] = buf.data[a + 1] = buf.data[a + 2] = 0;
		buf.data[a + 3] = 255;
	}
	for (var a = 0; a < font.chars.length; a++) {
		var bx = a * spacing;
		var chr = font.chars[a];
		for (var b = 0; b < chr.pixels.length; b += (font.shadow ? 4 : 3)) {
			buf.setPixel(bx + chr.pixels[b], chr.pixels[b + 1], [chr.pixels[b + 2], chr.pixels[b + 2], chr.pixels[b + 2], 255]);
			if (font.shadow) {
				buf.setPixel(bx + chr.pixels[b], chr.pixels[b + 1], [chr.pixels[b + 3], 0, 0, 255]);
			}
		}
	}
	buf.show()
}

/**
 * unblends a imagebuffer into match strength with given color
 * the bgimg argument should contain a second image with pixel occluded by the font visible.
 * @param img 
 * @param shadow detect black as second color
 * @param bgimg optional second image to 
 */
export function unblendKnownBg(img: ImageData, bgimg: ImageData, shadow: boolean, r: number, g: number, b: number) {
	if (bgimg && (img.width != bgimg.width || img.height != bgimg.height)) { throw "bgimg size doesn't match"; }
	var rimg = new ImageData(img.width, img.height);
	var totalerror = 0;
	for (var i = 0; i < img.data.length; i += 4) {
		var col = decompose2col(img.data[i], img.data[i + 1], img.data[i + 2], r, g, b, bgimg.data[i + 0], bgimg.data[i + 1], bgimg.data[i + 2]);
		if (shadow) {
			if (col[2] > 0.01) { console.log("high error component: " + (col[2] * 100).toFixed(1) + "%"); }
			totalerror += col[2];
			var m = 1 - col[1] - Math.abs(col[2]);//main color+black=100%-bg-error
			rimg.data[i + 0] = m * 255;
			rimg.data[i + 1] = col[0] / m * 255;
			rimg.data[i + 2] = rimg.data[i + 0];
		} else {
			rimg.data[i + 0] = col[0] * 255;
			rimg.data[i + 1] = rimg.data[i + 0];
			rimg.data[i + 2] = rimg.data[i + 0];
		}
		rimg.data[i + 3] = 255;
	}
	if (shadow) {
		console.log("avg unblend px error:" + (totalerror / img.width / img.height * 100).toFixed(1) + "%");
	}
	return rimg;
}

/**
 * Unblends a font image that is already conpletely isolated to the raw image used ingame. This is the easiest mode for pixel fonts where alpha is 0 or 255, or for extracted font files.
 * @param img
 * @param r
 * @param g
 * @param b
 * @param shadow whether the font has a black shadow
 */
export function unblendTrans(img: ImageData, shadow: boolean, r: number, g: number, b: number) {
	var rimg = new ImageData(img.width, img.height);
	var pxlum = r + g + b;
	for (var i = 0; i < img.data.length; i += 4) {
		if (shadow) {
			var lum = img.data[i + 0] + img.data[i + 1] + img.data[i + 2];
			rimg.data[i + 0] = img.data[i + 3];
			rimg.data[i + 1] = lum / pxlum * 255;
			rimg.data[i + 2] = rimg.data[i + 0];
		} else {
			rimg.data[i + 0] = img.data[i + 3];
			rimg.data[i + 1] = rimg.data[i + 0];
			rimg.data[i + 2] = rimg.data[i + 0];
		}
		rimg.data[i + 3] = 255;
	}
	return rimg;
}

/**
 * Determised wether color [rgb]m can be a result of a blend with color [rgb]1 that is p (0-1) of the mix
 * It returns the number that the second color has to lie outside of the possible color ranges
 * @param mr resulting color
 * @param r1 first color of the mix (the other color is unknown)
 * @param p the pertion of the [rgb]1 in the mix (0-1)
 */
export function canblend(rm: number, gm: number, bm: number, r1: number, g1: number, b1: number, p: number) {
	var m = Math.min(50, p / (1 - p));
	var r = rm + (rm - r1) * m;
	var g = gm + (gm - g1) * m;
	var b = bm + (bm - b1) * m;
	return Math.max(-r, -g, -b, r - 255, g - 255, b - 255);
}


/**
 * decomposes a color in 2 given component colors and returns the amount of each color present
 * also return a third (noise) component which is the the amount leftover orthagonal from the 2 given colors
 */
export function decompose2col(rp, gp, bp, r1, g1, b1, r2, g2, b2) {
	//get the normal of the error (cross-product of both colors)
	var r3 = g1 * b2 - g2 * b1;
	var g3 = b1 * r2 - b2 * r1;
	var b3 = r1 * g2 - r2 * g1;

	//normalize to length 255
	var norm = 255 / Math.sqrt(r3 * r3 + g3 * g3 + b3 * b3);
	r3 *= norm;
	g3 *= norm;
	b3 *= norm;

	return decompose3col(rp, gp, bp, r1, g1, b1, r2, g2, b2, r3, g3, b3);
}

/**
 * decomposes a color in 3 given component colors and returns the amount of each color present
 */
export function decompose3col(rp, gp, bp, r1, g1, b1, r2, g2, b2, r3, g3, b3) {
	//P=x*C1+y*C2+z*C3
	//assemble as matrix 
	//M*w=p
	//get inverse of M
	//dirty written out version of cramer's rule
	var A = g2 * b3 - b2 * g3;
	var B = g3 * b1 - b3 * g1;
	var C = g1 * b2 - b1 * g2;

	var D = b2 * r3 - r2 * b3;
	var E = b3 * r1 - r3 * b1;
	var F = b1 * r2 - r1 * b2;

	var G = r2 * g3 - g2 * r3;
	var H = r3 * g1 - g3 * r1;
	var I = r1 * g2 - g1 * r2;

	var det = r1 * A + g1 * D + b1 * G;

	//M^-1*p=w
	var x = (A * rp + D * gp + G * bp) / det;
	var y = (B * rp + E * gp + H * bp) / det;
	var z = (C * rp + F * gp + I * bp) / det;

	return [x, y, z];
}

/**
 * brute force to the exact position of the text
 */
export function findChar(buffer: ImageData, font: FontDefinition, col: ColortTriplet, x: number, y: number, w: number, h: number) {
	var shiftx = 0;
	var shifty = 0;

	if (x < 0) { return null; }
	if (y - font.basey < 0) { return null; }
	if (x + w + font.width > buffer.width) { return null; }
	if (y + h - font.basey + font.height > buffer.height) { return null; }

	var best = 1000;//TODO finetune score constants
	var bestchar: ReadCharInfo = null;
	for (var cx = x; cx < x + w; cx++) {
		for (var cy = y; cy < y + h; cy++) {
			var chr = readChar(buffer, font, col, cx, cy, false, false);
			if (chr != null && chr.sizescore < best) {
				best = chr.sizescore;
				bestchar = chr;
			}
		}
	}
	return bestchar;
}

/**
 * reads text with unknown exact coord or color. The given coord should be inside the text
 * color selection not implemented yet
 */
export function findReadLine(buffer: ImageData, font: FontDefinition, cols: [ColortTriplet], x: number, y: number, w = -1, h = -1) {
	if (w == -1) { w = font.width + font.spacewidth; x -= Math.ceil(w / 2); }
	if (h == -1) { h = 7; y -= 1; }
	var chr = findChar(buffer, font, cols[0], x, y, w, h);
	if (chr == null) { return { text: "", debugArea: { x, y, w, h } }; }
	return readLine(buffer, font, cols[0], chr.x, chr.y, true, true);
}

/**
 * reads a line of text with exactly known position and color. y should be the y coord of the text base line, x should be the first pixel of a new character
 */
export function readLine(buffer: ImageData, font: FontDefinition, colors: ColortTriplet | ColortTriplet[], x: number, y: number, forward: boolean, backward?: boolean) {
	var multicol = typeof colors[0] != "number";
	var allcolors: ColortTriplet[] = multicol ? colors as ColortTriplet[] : [colors as ColortTriplet];

	var detectcolor = function (x, y, backward) {
		var best = null as ColortTriplet;
		var bestscore = Infinity;
		for (var a = 0; a < allcolors.length; a++) {
			var chr = readChar(buffer, font, allcolors[a], x, y, backward, false);
			if (chr && chr.sizescore < bestscore) {
				best = allcolors[a];
				bestscore = chr.sizescore;
			}
		}
		return best;
	}

	var r = "";
	var x1 = x;
	var x2 = x;

	for (var dirforward of [true, false]) {
		//init vars
		if (dirforward && !forward) { continue; }
		if (!dirforward && !backward) { continue; }

		var dx = 0;
		var triedspace = false;
		var triedrecol = false;
		var col = multicol ? null : colors as ColortTriplet;

		while (true) {
			col = col || detectcolor(x + dx, y, !dirforward);
			var chr = (col ? readChar(buffer, font, col, x + dx, y, !dirforward, true) : null);
			if (chr == null) {
				if (multicol && !triedrecol) {
					col = null;
					triedrecol = true;
					continue;
				}
				if (!triedspace) {
					dx += (dirforward ? 1 : -1) * font.spacewidth;
					triedrecol = false;
					triedspace = true;
					continue;
				}
				if (dirforward) { x2 = x + dx - font.spacewidth; }
				else { x1 = x + dx + font.spacewidth; }
				break;
			} else {
				if (dirforward) { r += (triedspace ? " " : "") + chr.chr; }
				else { r = chr.chr + (triedspace ? " " : "") + r; }
				triedspace = false;
				triedrecol = false;
				dx += (dirforward ? 1 : -1) * chr.basechar.width;
			}
		}
	}
	return {
		debugArea: { x: x1, y: y - 9, w: x2 - x1, h: 10 },
		text: r
	};
}

/**
 * Reads a single character at the exact given location
 * @param x exact x location of the start of the character domain (includes part of the spacing between characters)
 * @param y exact y location of the baseline pixel of the character
 * @param backwards read in backwards direction, the x location should be the first pixel after the character domain in that case
 */
export function readChar(buffer: ImageData, font: FontDefinition, col: ColortTriplet, x: number, y: number, backwards: boolean, allowSecondary?: boolean): ReadCharInfo {
	y -= font.basey;
	var shiftx = 0;
	var shifty = font.basey;
	var shadow = font.shadow;
	var debugobj: Chardebug[] = null;
	var debugimg: ImageData = null;
	if (debug.trackread) {
		var name = x + ";" + y + " " + JSON.stringify(col);
		if (!debugout[name]) { debugout[name] = []; }
		debugobj = debugout[name];
	}

	//===== make sure the full domain is inside the bitmap/buffer ======
	if (y < 0 || y + font.height >= buffer.height) { return null; }
	if (!backwards) {
		if (x < 0 || x + font.width > buffer.width) { return null; }
	}
	else {
		if (x - font.width < 0 || x > buffer.width) { return null; }
	}

	//====== start reading the char ======
	var scores: { score: number, sizescore: number, chr: Charinfo }[] = [];
	for (var chr = 0; chr < font.chars.length; chr++) {
		var chrobj = font.chars[chr];
		if (chrobj.secondary && !allowSecondary) { continue; }
		scores[chr] = { score: 0, sizescore: 0, chr: chrobj };
		var chrx = (backwards ? x - chrobj.width : x);


		if (debug.trackread) {
			debugimg = new ImageData(font.width, font.height);
		}

		for (var a = 0; a < chrobj.pixels.length;) {
			var i = (chrx + chrobj.pixels[a]) * 4 + (y + chrobj.pixels[a + 1]) * buffer.width * 4;
			var penalty = 0;
			if (!shadow) {
				penalty = canblend(buffer.data[i], buffer.data[i + 1], buffer.data[i + 2], col[0], col[1], col[2], chrobj.pixels[a + 2] / 255);
				a += 3;
			}
			else {
				var lum = chrobj.pixels[a + 3] / 255;
				penalty = canblend(buffer.data[i], buffer.data[i + 1], buffer.data[i + 2], col[0] * lum, col[1] * lum, col[2] * lum, chrobj.pixels[a + 2] / 255);
				a += 4;
			}
			scores[chr].score += Math.max(0, penalty);
			//TODO add compiler flag to this to remove it for performance
			if (debugimg) { debugimg.setPixel(chrobj.pixels[a], chrobj.pixels[a + 1], [penalty, penalty, penalty, 255]); }
		}
		scores[chr].sizescore = scores[chr].score - chrobj.bonus;
		if (debugobj) { debugobj.push({ chr: chrobj.chr, score: scores[chr].sizescore, rawscore: scores[chr].score, img: debugimg }); }
	}

	scores.sort((a, b) => a.sizescore - b.sizescore);

	if (debug.printcharscores) {
		scores.slice(0, 5).forEach(q => console.log(q.chr.chr, q.score.toFixed(3), q.sizescore.toFixed(3)));
	}

	var winchr = scores[0];
	if (!winchr || winchr.score > 400) { return null; }

	return { chr: winchr.chr.chr, basechar: winchr.chr, x: x + shiftx, y: y + shifty, score: winchr.score, sizescore: winchr.sizescore };
}
type ReadCharInfo = { chr: string, basechar: Charinfo, x: number, y: number, score: number, sizescore: number };

/**
 * Generates a font json description to use in reader functions
 * @param unblended A source image with all characters lined up. The image should be unblended into components using the unblend functions
 * The lowest pixel line of this image is used to mark the location and size of the charecters if the red component is 255 it means there is a character on that pixel column
 * @param chars A string containing all the characters of the image in the same order
 * @param seconds A string with characters that are considered unlikely and should only be detected if no other character is possible.
 * For example the period (.) character matches positive inside many other characters and should be marked as secondary
 * @param bonusses An object that contains bonus scores for certain difficult characters to make the more liekly to be red.
 * @param basey The y position of the baseline pixel of the font
 * @param spacewidth the number of pixels a space takes
 * @param treshold minimal color match proportion (0-1) before a pixel is used for the font
 * @param shadow whether this font also uses the black shadow some fonts have. The "unblended" image should be unblended correspondingly
 * @returns a javascript object describing the font which is used as input for the different read functions
 */
export function generatefont(unblended: ImageData, chars: string, seconds: string, bonusses: { [char: string]: number }, basey: number, spacewidth: number, treshold: number, shadow: boolean): FontDefinition {
	//settings vars
	treshold *= 255;

	//initial vars
	var miny = unblended.height - 1;
	var maxy = 0;
	var font = { chars: [] as Charinfo[], width: 0, spacewidth: spacewidth, shadow: shadow, height: 0, basey: 0 };
	var ds: false | number = false;

	type internalcharinfo = Charinfo & { ds: number, de: number };

	var chardata: internalcharinfo[] = [];
	//index all chars
	for (var dx = 0; dx < unblended.width; dx++) {
		var i = 4 * dx + 4 * unblended.width * (unblended.height - 1);

		if (unblended.data[i] == 255 && unblended.data[i + 3] == 255) {
			if (ds === false) { ds = dx; }
		}
		else {
			if (ds !== false) {
				//char found, start detection
				var de = dx;
				var char = chars[chardata.length];
				var chr: internalcharinfo = {
					ds: ds,
					de: de,
					width: de - ds,
					chr: char,
					bonus: (bonusses && bonusses[char]) || 0,
					secondary: seconds.indexOf(chars[chardata.length]) != -1,
					pixels: []
				};
				chardata.push(chr);
				font.width = Math.max(font.width, chr.width);

				for (x = 0; x < de - ds; x++) {
					for (y = 0; y < unblended.height - 1; y++) {
						var i = (x + ds) * 4 + y * unblended.width * 4;
						if (unblended.data[i] >= treshold) {
							miny = Math.min(miny, y);
							maxy = Math.max(maxy, y);
						}
					}
				}
				ds = false;
			}
		}
	}
	font.height = maxy + 1 - miny;
	font.basey = basey - miny;

	//detect all pixels
	for (var a in chardata) {
		var chr = chardata[a];
		for (var x = 0; x < chr.width; x++) {
			for (var y = 0; y < maxy + 1 - miny; y++) {
				var i = (x + chr.ds) * 4 + (y + miny) * unblended.width * 4;
				if (unblended.data[i] >= treshold) {
					chr.pixels.push(x, y);
					chr.pixels.push(unblended.data[i]);
					if (shadow) { chr.pixels.push(unblended.data[i + 1]); }
					chr.bonus += 5;
				}
			}
		}
		//remove process vars from final json obj
		delete chr.ds;
		delete chr.de;
		//prevent js from doing the thing with unnecessary output precision
		chr.bonus = +chr.bonus.toFixed(3);

		font.chars.push(chr);
	}

	return font;
}
