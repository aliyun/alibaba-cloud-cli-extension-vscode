const httpx = require('httpx');

const metadata = require('./products.json');

function getProducts(locale) {
  return metadata.products;
}

function getApis(name, locale) {
  const product = metadata.products.find((d) => {
    return d.code.toLowerCase() === name;
  });

  if (!product) {
    return [];
  }

  return product.apis;
}

function getLink(productName, api, locale) {
  const product = metadata.products.find((d) => {
    return d.code.toLowerCase() === productName;
  });

  if (!product) {
    return;
  }

  const version = product.version;
  return `https://api.aliyun.com/document/${product.code}/${version}/${api}`;
}

async function getParameters(proudctName, api, locale) {
  const product = metadata.products.find((d) => {
    return d.code.toLowerCase() === proudctName;
  });

  if (!product) {
    return [];
  }
  const language = locale === 'zh-CN' ? 'ZH_CN' : 'EN_US';
  const version = product.version;
  const url = `https://api.aliyun.com/meta/v1/products/${proudctName}/versions/${version}/apis/${api}/api.json?language=${language}`;
  const response = await httpx.request(url);
  if (response.statusCode !== 200) {
    return [];
  }

  const body = await httpx.read(response, 'utf8');
  const data = JSON.parse(body);
  return data.parameters;
}

module.exports = {
  getProducts,
  getApis,
  getLink,
  getParameters,
};