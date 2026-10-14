/**
 * 强智教务系统动态混淆加密算法 (SDUST QiangZhi Password Encryption)
 * 对应教务系统客户端与 SHST-ULTRA 的登录加密逻辑
 */

function base64Encode(str: string): string {
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function (_, p1) {
      return String.fromCharCode(parseInt(p1, 16));
    })
  );
}

/**
 * 混淆加密账号密码
 * @param account 学号
 * @param password 密码
 * @param scode 页面隐藏域提取的种子密钥 1
 * @param sxh 页面隐藏域提取的混淆步长 2
 */
export function encodeCredentials(account: string, pass: string, scode: string, sxh: string): string {
  const accountCode = base64Encode(account);
  const passwordCode = base64Encode(pass);
  const spaceCode = base64Encode(' ');
  const code = accountCode + '%%%' + passwordCode + '%%%' + spaceCode;

  let curScode = scode;
  let encoded = '';
  const codeLength = code.length;

  for (let i = 0; i < codeLength; i++) {
    if (i < 55 && i < sxh.length) {
      const step = parseInt(sxh.charAt(i), 10);
      encoded += code.charAt(i) + curScode.substring(0, step);
      curScode = curScode.substring(step);
    } else {
      encoded += code.substring(i);
      break;
    }
  }

  return encoded;
}
