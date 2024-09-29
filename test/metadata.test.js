const assert = require('assert');

const metadata = require('../src/metadata');

describe('metadata Test Suite', () => {
  it('getProducts', () => {
    assert.ok(metadata.getProducts().length > 0);
  });

  it('getApis', () => {
    assert.ok(metadata.getApis('ecs').length > 0);
    assert.deepStrictEqual(metadata.getApis('invald'), []);
  });

  it('getLink', () => {
    assert.strictEqual(metadata.getLink('ecs', 'DescribeRegions'), 'https://api.aliyun.com/document/Ecs/2014-05-26/DescribeRegions');
    assert.strictEqual(metadata.getLink('invalidProduct', 'DescribeRegions'), undefined);
  });

  it('getParameters', async () => {
    const parameters = await metadata.getParameters('ecs', 'DescribeRegions', 'zh-CN');
    assert.deepStrictEqual(parameters, [
      {
        "in": "query",
        "name": "InstanceChargeType",
        "schema": {
          "description": "实例的计费方式，更多信息，请参见[计费概述](~~25398~~)。取值范围：\n\n- PrePaid：包年包月。此时，请确认自己的账号支持余额支付或者信用支付，否则将报错InvalidPayMethod。\n- PostPaid：按量付费。\n- SpotWithPriceLimit：设置上限价格。\n- SpotAsPriceGo：系统自动出价，最高按量付费价格。\n\n默认值：PostPaid。",
          "example": "PrePaid",
          "required": false,
          "type": "string"
        }
      },
      {
        "in": "query",
        "name": "ResourceType",
        "schema": {
          "description": "资源类型。取值范围：\n\n-  instance：ECS实例。\n-  disk：磁盘。\n-  reservedinstance：预留实例券。\n-  scu：存储容量单位包。\n\n默认值：instance。",
          "example": "instance",
          "required": false,
          "type": "string"
        }
      },
      {
        "in": "query",
        "name": "AcceptLanguage",
        "schema": {
          "description": " 根据汉语、英语和日语筛选返回结果。更多详情，请参见[RFC 7231](https://tools.ietf.org/html/rfc7231)。取值范围：  \n         \n- zh-CN：中文。\n- en-US：英文。\n- ja：日文。\n\n默认值：zh-CN。",
          "example": "zh-CN",
          "required": false,
          "type": "string"
        }
      }
    ]);

    // invalid product
    const parameters2 = await metadata.getParameters('invalidProduct', 'DescribeRegions');
    assert.deepStrictEqual(parameters2, []);

    // invalid api
    const parameters3 = await metadata.getParameters('ecs', 'InvalidAPI');
    assert.deepStrictEqual(parameters3, []);
  });
});
