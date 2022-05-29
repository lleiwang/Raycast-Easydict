import axios from "axios";
import crypto from "crypto";
import querystring from "node:querystring";
import { getPreferenceValues } from "@raycast/api";
import { LANGUAGE_LIST, SectionType, TranslationType } from "./consts";

import {
  LanguageItem,
  IPreferences,
  QueryTextInfo,
  TranslateDisplayResult,
  TranslateReformatResult,
  TranslateSourceResult,
  TranslationItem,
  YoudaoTranslateReformatResult,
  YoudaoTranslateResult,
} from "./types";

export function truncate(string: string, length = 40, separator = "...") {
  if (string.length <= length) return string;
  return string.substring(0, length) + separator;
}

function isPreferredChinese(): boolean {
  const lanuguageIdPrefix = "zh";
  const preferences: IPreferences = getPreferenceValues();
  console.log("preferences: ", JSON.stringify(preferences));
  if (
    preferences.language1.startsWith(lanuguageIdPrefix) ||
    preferences.language2.startsWith(lanuguageIdPrefix)
  ) {
    return true;
  } else {
    return false;
  }
}

export function getItemFromLanguageList(value: string): LanguageItem {
  for (const langItem of LANGUAGE_LIST) {
    if (langItem.languageId === value) {
      return langItem;
    }
  }

  return {
    languageId: "",
    languageTitle: "",
    languageVoice: [""],
  };
}

export function reformatYoudaoTranslateResult(
  data: YoudaoTranslateResult
): YoudaoTranslateReformatResult[] {
  const reformatData: YoudaoTranslateReformatResult[] = [];

  reformatData.push({
    type: SectionType.Translation,
    children: data.translation?.map((text, idx) => {
      return {
        title: text,
        key: text + idx,
        copyText: text,
        phonetic: data.basic?.phonetic,
        examTypes: data.basic?.exam_type,
      };
    }),
  });

  // Delete repeated text item
  // 在有道结果中 Translation 目前观测虽然是数组，但只会返回length为1的结果，而且重复只是和explains[0]。
  if (data.basic?.explains && data?.translation) {
    data.basic?.explains[0] === data?.translation[0] &&
      data.basic.explains.shift();
  }

  reformatData.push({
    type: SectionType.Detail,
    children: data.basic?.explains?.map((text, idx) => {
      return { title: text, key: text + idx, copyText: text };
    }),
  });

  const wfs = data.basic?.wfs?.map((wfItem, idx) => {
    return wfItem.wf?.name + " " + wfItem.wf?.value;
  });

  // [ 复数 goods   比较级 better   最高级 best ]
  const wfsText = wfs?.join("   ") || "";
  if (wfsText.length) {
    reformatData.push({
      type: SectionType.Forms,
      children: [
        {
          title: "",
          key: wfsText,
          subtitle: `[ ${wfsText} ]`,
          copyText: wfsText,
        },
      ],
    });
  }

  // good  好的；善；良好
  const webResults = data.web?.map((webResultItem, idx) => {
    const webResultKey = webResultItem.key;
    const webResultVaule = useSymbolSegmentationArrayText(webResultItem.value);
    return {
      type: idx === 0 ? SectionType.WebTranslation : SectionType.WebPhrase,
      children: [
        {
          title: webResultKey,
          key: webResultKey,
          subtitle: webResultVaule,
          copyText: `${webResultKey} ${webResultVaule}`,
        },
      ],
    };
  });

  webResults?.map((webResultItem) => {
    reformatData.push(webResultItem);
  });

  return reformatData;
}

// API Document https://ai.youdao.com/DOCSIRMA/html/自然语言翻译/API文档/文本翻译服务/文本翻译服务-API文档.html
export function requestYoudaoAPI(
  queryText: string,
  fromLanguage: string,
  targetLanguage: string
): Promise<any> {
  function truncate(q: string): string {
    const len = q.length;
    return len <= 20
      ? q
      : q.substring(0, 10) + len + q.substring(len - 10, len);
  }

  const preferences: IPreferences = getPreferenceValues();
  const APP_ID = preferences.appId;
  const APP_KEY = preferences.appKey;

  const sha256 = crypto.createHash("sha256");
  const timestamp = Math.round(new Date().getTime() / 1000);
  const salt = timestamp;
  const sha256Content =
    APP_ID + truncate(queryText) + salt + timestamp + APP_KEY;
  const sign = sha256.update(sha256Content).digest("hex");
  const url = "https://openapi.youdao.com/api";

  return axios.post(
    url,
    querystring.stringify({
      sign,
      salt,
      from: fromLanguage,
      signType: "v3",
      q: queryText,
      appKey: APP_ID,
      curtime: timestamp,
      to: targetLanguage,
    })
  );
}

export function useSymbolSegmentationArrayText(textArray: string[]): string {
  return textArray.join("；");
}

// 百度翻译API https://fanyi-api.baidu.com/doc/21
export function requestBaiduAPI(
  queryText: string,
  fromLanguage: string,
  targetLanguage: string
): Promise<any> {
  const APP_ID = "20220428001194113";
  const APP_KEY = "kiaee1BtT9d2MGJUdAMi";
  const md5 = crypto.createHash("md5");
  const salt = Math.round(new Date().getTime() / 1000);
  const md5Content = APP_ID + queryText + salt + APP_KEY;
  const sign = md5.update(md5Content).digest("hex");
  const apiServer = "https://fanyi-api.baidu.com/api/trans/vip/translate";

  const from = getItemFromLanguageList(fromLanguage).baiduLanguageId;
  const to = getItemFromLanguageList(targetLanguage).baiduLanguageId;

  let encodeQueryText = encodeURIComponent(queryText);

  const url =
    apiServer +
    `?q=${encodeQueryText}&from=${from}&to=${to}&appid=${APP_ID}&salt=${salt}&sign=${sign}`;
  return axios.get(url);
}

// 彩云小译 https://docs.caiyunapp.com/blog/2018/09/03/lingocloud-api/#%E7%94%B3%E8%AF%B7%E8%AE%BF%E9%97%AE%E4%BB%A4%E7%89%8C
export function requestCaiyunAPI(
  queryText: string,
  fromLanguage: string,
  targetLanguage: string
): Promise<any> {
  const token = "izz99g9m50n4hpi71oke";
  const url = "https://api.interpreter.caiyunai.com/v1/translator";

  const from = getItemFromLanguageList(fromLanguage).caiyunLanguageId || "auto";
  const to = getItemFromLanguageList(targetLanguage).caiyunLanguageId;
  const trans_type = `${from}2${to}`; // "auto2xx";
  console.log("caiyun trans_type: ", trans_type);

  return axios.post(
    url,
    {
      source: queryText,
      trans_type,
      detect: from === "auto",
    },
    {
      headers: {
        "content-type": "application/json",
        "x-authorization": "token " + token,
      },
    }
  );
}

// 并发请求多个翻译接口
export function requestAllTranslateAPI(
  queryText: string,
  fromLanguage: string,
  targetLanguage: string
): Promise<any> {
  return axios.all([
    requestYoudaoAPI(queryText, fromLanguage, targetLanguage),
    requestBaiduAPI(queryText, fromLanguage, targetLanguage),
    requestCaiyunAPI(queryText, fromLanguage, targetLanguage),
  ]);
}

export function reformatTranslateResult(
  src: TranslateSourceResult
): TranslateReformatResult {
  let translations: TranslationItem[] = [];

  const youdaoTranslations = src.youdaoResult.translation.map(
    (translationText) => {
      return {
        type: isPreferredChinese()
          ? TranslationType.YoudaoZh
          : TranslationType.Youdao,
        text: translationText,
      };
    }
  );

  translations.push(...youdaoTranslations);

  const baiduTranslation = src.baiduResult.trans_result
    .map((item) => {
      return item.dst;
    })
    .join(" ");

  translations.push({
    type: isPreferredChinese()
      ? TranslationType.BaiduZh
      : TranslationType.Baidu,
    text: baiduTranslation,
  });

  translations.push({
    type: isPreferredChinese()
      ? TranslationType.CaiyunZh
      : TranslationType.Caiyun,
    text: src.caiyunResult.target,
  });

  const [from, to] = src.youdaoResult.l.split("2"); // from2to
  const queryTextInfo: QueryTextInfo = {
    query: src.youdaoResult.query,
    phonetic: src.youdaoResult.basic?.phonetic,
    from: from,
    to: to,
    isWord: src.youdaoResult.isWord,
    examTypes: src.youdaoResult.basic?.exam_type,
  };

  let webTranslation;
  if (src.youdaoResult.web) {
    webTranslation = src.youdaoResult.web[0];
  }
  const webPhrases = src.youdaoResult.web?.slice(1);

  return {
    queryTextInfo: queryTextInfo,
    translations: translations,
    details: src.youdaoResult.basic?.explains,
    forms: src.youdaoResult.basic?.wfs,
    webTranslation: webTranslation,
    webPhrases: webPhrases,
  };
}

export function reformatTranslateDisplayResult(
  reformatResult: TranslateReformatResult
): TranslateDisplayResult[] {
  let displayResult: Array<TranslateDisplayResult> = [];
  const isWord = reformatResult.queryTextInfo.isWord;

  for (const [i, translation] of reformatResult.translations.entries()) {
    let sectionTitle;
    if (i === 0) {
      sectionTitle = SectionType.Translation;
    }
    if (!isWord) {
      sectionTitle = translation.type;
    }

    displayResult.push({
      type: sectionTitle || SectionType.Translation,
      sectionTitle: sectionTitle,
      items: [
        {
          key: translation.text + i,
          title: translation.text,
          tooltip: translation.type,
          copyText: translation.text,
          phonetic: reformatResult.queryTextInfo.phonetic,
          examTypes: reformatResult.queryTextInfo.examTypes,
        },
      ],
    });
    if (
      isWord ||
      reformatResult.details?.length ||
      reformatResult.webPhrases?.length
    ) {
      break;
    }
  }

  reformatResult.details?.forEach((detail, i) => {
    let sectionTitle;
    if (i === 0) {
      sectionTitle = SectionType.Detail;
    }

    displayResult.push({
      type: SectionType.Detail,
      sectionTitle: sectionTitle,
      items: [
        {
          key: detail + i,
          title: detail,
          tooltip: SectionType.Explains,
          copyText: detail,
        },
      ],
    });
  });

  const wfs = reformatResult.forms?.map((wfItem, idx) => {
    return wfItem.wf?.name + " " + wfItem.wf?.value;
  });

  // [ 复数 goods   比较级 better   最高级 best ]
  const wfsText = wfs?.join("   ") || "";
  if (wfsText.length) {
    displayResult.push({
      type: SectionType.Forms,
      items: [
        {
          key: wfsText,
          title: "",
          tooltip: SectionType.Forms,
          subtitle: `[ ${wfsText} ]`,
          copyText: wfsText,
        },
      ],
    });
  }

  if (reformatResult.webTranslation) {
    const webResultKey = reformatResult.webTranslation?.key;
    const webResultValue = reformatResult.webTranslation.value.join("；");
    displayResult.push({
      type: SectionType.WebTranslation,
      items: [
        {
          key: webResultKey,
          title: webResultKey,
          tooltip: SectionType.WebTranslation,
          subtitle: webResultValue,
          copyText: `${webResultKey} ${webResultValue}`,
        },
      ],
    });
  }

  reformatResult.webPhrases?.forEach((phrase, i) => {
    const phraseKey = phrase.key;
    const phraseValue = phrase.value.join("；");
    displayResult.push({
      type: SectionType.WebPhrase,
      items: [
        {
          key: phraseKey + i,
          title: phraseKey,
          tooltip: SectionType.WebPhrase,
          subtitle: phraseValue,
          copyText: `${phraseKey} ${phraseValue}`,
        },
      ],
    });
  });

  console.log("displayResult: ", JSON.stringify(displayResult));

  return displayResult;
}
