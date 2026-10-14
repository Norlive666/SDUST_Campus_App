/**
 * 强智教务图形验证码纯前端客户端识别引擎
 * 基于 WindrunnerMax/SWVerifyCode 图像字模二值化降噪与特征比对算法
 */

const HEIGHT = 22;
const WIDTH = 62;
const RGB_THRESHOLD = 150;

const CHAR_MAP: Record<string, string> = {
  '1': '111100111110000111110000111111100111111100111111100111111100111111100111111100111111100111110000001110000001',
  '2': '100000111000000011111111001111111001111111001111110011111000111110011111100111111001111111000000001000000001',
  '3': '100000111000000011111110001111111001111110011110000111110000011111110001111111001111110001100000011100000111',
  'b': '001111111001111111001111111001000011000000001000111000001111100001111100001111100000111000000000001001000011',
  'c': '111111111111111111111111111110000011100000011000111111001111111001111111001111111000111111100000011110000011',
  'm': '111111111111111111111111111001000011000000000000111000001111001001111001001111001001111001001111001001111001',
  'n': '111111111111111111111111111001100001001000000000011100000111100001111100001111100001111100001111100001111100',
  'v': '111111111111111111111111111111111011001110011001110011001110011100100111100100111100100111110001111110001111',
  'x': '111111111111111111111111111001110011001110011100100111110001111110001111110001111100100111001110011001110011',
  'z': '111111111111111111111111111000000011000000011111100111111001111110011111100111111001111111000000011000000011',
};

function binaryImage(imageData: ImageData): number[][] {
  const data = imageData.data;
  const imgArr: number[][] = [];

  for (let y = 0; y < HEIGHT; y++) {
    imgArr[y] = [];
    for (let x = 0; x < WIDTH; x++) {
      if (x === 0 || y === 0 || x === WIDTH - 1 || y === HEIGHT - 1) {
        imgArr[y][x] = 1;
        continue;
      }
      const idx = (y * WIDTH + x) * 4;
      if (
        data[idx] < RGB_THRESHOLD &&
        data[idx + 1] < RGB_THRESHOLD &&
        data[idx + 2] < RGB_THRESHOLD
      ) {
        imgArr[y][x] = 0;
      } else {
        imgArr[y][x] = 1;
      }
    }
  }

  return imgArr;
}

function removeNoise(imgArr: number[][]): number[][] {
  const yCount = imgArr.length;
  const xCount = imgArr[0].length;

  for (let y = 1; y < yCount - 1; y++) {
    for (let x = 1; x < xCount - 1; x++) {
      if (imgArr[y][x] === 0) {
        const countWhite =
          imgArr[y][x - 1] +
          imgArr[y][x + 1] +
          imgArr[y - 1][x] +
          imgArr[y + 1][x];
        if (countWhite > 2) {
          imgArr[y][x] = 1;
        }
      }
    }
  }
  return imgArr;
}

function cutChars(imgArr: number[][]): number[][][] {
  const arrX = [
    [4, 13],
    [14, 23],
    [24, 33],
    [34, 43],
  ];
  const arrY = [
    [4, 16],
    [4, 16],
    [4, 16],
    [4, 16],
  ];
  const chars: number[][][] = [];

  for (let i = 0; i < 4; i++) {
    const unit: number[][] = [];
    for (let y = arrY[i][0]; y < arrY[i][1]; y++) {
      const rowIdx = y - arrY[i][0];
      unit[rowIdx] = [];
      for (let x = arrX[i][0]; x < arrX[i][1]; x++) {
        unit[rowIdx][x - arrX[i][0]] = imgArr[y][x];
      }
    }
    chars.push(unit);
  }

  return chars;
}

function charToString(matrix: number[][]): string {
  let s = '';
  for (let y = 0; y < matrix.length; y++) {
    for (let x = 0; x < matrix[y].length; x++) {
      s += matrix[y][x];
    }
  }
  return s;
}

function matchCode(chars: number[][][]): string {
  let result = '';

  for (const charMatrix of chars) {
    const str = charToString(charMatrix);
    let bestMatch = -1;
    let bestChar = '';

    for (const [char, pattern] of Object.entries(CHAR_MAP)) {
      let matchedCount = 0;
      const len = Math.min(str.length, pattern.length);
      for (let i = 0; i < len; i++) {
        if (str[i] === pattern[i]) matchedCount++;
      }
      if (matchedCount > bestMatch) {
        bestMatch = matchedCount;
        bestChar = char;
      }
    }
    result += bestChar;
  }

  return result;
}

/**
 * 识别 Base64 或 Image 图片验证码
 */
export async function recognizeVerifyCode(imgOrBase64: HTMLImageElement | string): Promise<string> {
  return new Promise((resolve, reject) => {
    let img: HTMLImageElement;

    const process = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = WIDTH;
        canvas.height = HEIGHT;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          return resolve('');
        }
        ctx.drawImage(img, 0, 0, WIDTH, HEIGHT);
        const imageData = ctx.getImageData(0, 0, WIDTH, HEIGHT);
        let imgArr = binaryImage(imageData);
        imgArr = removeNoise(imgArr);
        const chars = cutChars(imgArr);
        const code = matchCode(chars);
        resolve(code);
      } catch (err) {
        console.warn('验证码自动识别出错:', err);
        resolve('');
      }
    };

    if (typeof imgOrBase64 === 'string') {
      img = new Image();
      img.onload = process;
      img.onerror = () => resolve('');
      img.src = imgOrBase64;
    } else {
      img = imgOrBase64;
      if (img.complete) {
        process();
      } else {
        img.onload = process;
        img.onerror = () => resolve('');
      }
    }
  });
}
