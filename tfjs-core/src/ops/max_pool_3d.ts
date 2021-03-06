/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */

import {ENGINE, ForwardFunc} from '../engine';
import {deprecationWarn} from '../globals';
import {MaxPool3D, MaxPool3DAttrs, MaxPool3DInputs} from '../kernel_names';
import {NamedAttrMap} from '../kernel_registry';
import {Tensor, Tensor4D, Tensor5D} from '../tensor';
import {NamedTensorMap} from '../tensor_types';
import {convertToTensor} from '../tensor_util_env';
import {TensorLike} from '../types';
import * as util from '../util';

import * as conv_util from './conv_util';
import {op} from './operation';
import {reshape} from './reshape';

/**
 * Computes the 3D max pooling.
 *
 * ```js
 * const x = tf.tensor5d([1, 2, 3, 4, 5, 6, 7, 8], [1, 2, 2, 2, 1]);
 * const result = tf.maxPool3d(x, 2, 1, 'valid');
 * result.print();
 * ```
 *
 * @param x The input tensor, of rank 5 or rank 4 of shape
 *     `[batch, depth, height, width, inChannels]`.
 * @param filterSize The filter size:
 *     `[filterDepth, filterHeight, filterWidth]`.
 *     If `filterSize` is a single number,
 *     then `filterDepth == filterHeight == filterWidth`.
 * @param strides The strides of the pooling:
 *     `[strideDepth, strideHeight, strideWidth]`.
 *     If `strides` is a single number,
 *     then `strideDepth == strideHeight == strideWidth`.
 * @param pad The type of padding algorithm.
 *    - `same` and stride 1: output will be of same size as input,
 *       regardless of filter size.
 *    - `valid`: output will be smaller than input if filter is larger
 *       than 1*1x1.
 *    - For more info, see this guide:
 *     [https://www.tensorflow.org/api_guides/python/nn#Convolution](
 *          https://www.tensorflow.org/api_guides/python/nn#Convolution)
 * @param dimRoundingMode The rounding mode used when computing output
 *     dimensions if pad is a number. If none is provided, it will not round
 *     and error if the output is of fractional size.
 * @param dataFormat An optional string from: "NDHWC", "NCDHW". Defaults to
 *     "NDHWC". Specify the data format of the input and output data. With the
 *     default format "NDHWC", the data is stored in the order of: [batch,
 *     depth, height, width, channels]. Only "NDHWC" is currently supported.
 * @param dilations Deprecated, this field will be gone in v3.0.0.
 *     The dilation rates: `[dilationDepth, dilationHeight, dilationWidth]`
 *     in which we sample input values across the depth, height and width
 *     dimensions in dilated pooling.
 *     Defaults to `[1, 1, 1]`. If `dilations` is a single number,
 *     then `dilationDepth == dilationHeight == dilationWidth`.
 *     If it is greater than 1, then all values of `strides` must be 1.
 */
/** @doc {heading: 'Operations', subheading: 'Convolution'} */
function maxPool3d_<T extends Tensor4D|Tensor5D>(
    x: T|TensorLike, filterSize: [number, number, number]|number = [1, 1, 1],
    strides: [number, number, number]|number, pad: 'valid'|'same'|number,
    dimRoundingMode?: 'floor'|'round'|'ceil',
    dataFormat: 'NDHWC'|'NCDHW' = 'NDHWC',
    dilations?: [number, number, number]|number): T {
  if (dilations == null) {
    dilations = [1, 1, 1];
  } else {
    deprecationWarn(
        'dilations is deprecated, this field will be gone in ' +
        'v3.0.0.');
  }

  const $x = convertToTensor(x, 'x', 'maxPool3d');

  let x5D = $x as Tensor5D;
  let reshapedTo5D = false;
  if ($x.rank === 4) {
    reshapedTo5D = true;
    x5D = reshape($x, [1, $x.shape[0], $x.shape[1], $x.shape[2], $x.shape[3]]);
  }

  util.assert(
      x5D.rank === 5,
      () => `Error in maxPool3d: x must be rank 5 but got rank ${x5D.rank}.`);
  util.assert(
      dataFormat === 'NDHWC',
      () => `Error in maxPool3d: Only NDHWC is currently supported, ` +
          `but got dataFormat of ${dataFormat}`);
  util.assert(
      conv_util.eitherStridesOrDilationsAreOne(strides, dilations),
      () => 'Error in maxPool3d: Either strides or dilations must be 1. ' +
          `Got strides ${strides} and dilations '${dilations}'`);
  if (dimRoundingMode != null) {
    util.assert(
        util.isInt(pad as number),
        () => `Error in maxPool3d: pad must be an integer when using, ` +
            `dimRoundingMode ${dimRoundingMode} but got pad ${pad}.`);
  }

  const forward: ForwardFunc<Tensor> = (backend, save) => {
    if (dilations == null) {
      dilations = [1, 1, 1];
    }
    const convInfo = conv_util.computePool3DInfo(
        x5D.shape, filterSize, strides, dilations, pad, dimRoundingMode,
        dataFormat);
    const y = backend.maxPool3d(x5D, convInfo);
    save([x5D, y]);
    return y;
  };

  const inputs: MaxPool3DInputs = {x: x5D};

  const attrs: MaxPool3DAttrs =
      {filterSize, strides, pad, dimRoundingMode, dataFormat, dilations};

  const res = ENGINE.runKernelFunc(
      forward, inputs as {} as NamedTensorMap, null /* grad */, MaxPool3D,
      attrs as {} as NamedAttrMap);

  if (reshapedTo5D) {
    return reshape(
               res, [res.shape[1], res.shape[2], res.shape[3], res.shape[4]]) as
        T;
  }

  return res as T;
}

export const maxPool3d = op({maxPool3d_});
