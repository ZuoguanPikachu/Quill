---
title: 部落冲突辅助后记：新·数字识别
date: 2025-02-21 20:16:13
tags: [Python, 神经网络]
categories: 编程
index_img: https://zuoguan-piclib-1257172707.cos.ap-guangzhou.myqcloud.com/assets/19.jpg
---

由于部落冲突场景皮肤等因素，我之前所采用的二值化的方法，受到了限制。比如场景皮肤是白色主题，会导致无法正常二值化。所以我决定采用OCR的方案。我之前也挺好奇OCR的具体原理。

## 粗了解

简单OCR基本上由2个网络组成：检测网络、识别网络。检测网络用于框选出文字区域。识别网络用于识别文字。PaddleOCR这类先进的，还有方向分类器。而在我的这项任务中，只需要用到识别网络。

## 识别网络

识别网络大致框架：

1. 卷积神经网络。经过卷积神经网络，数据的`shape`为`[batch_size, n_feature, height, width]`，其中`height=1`，即`[batch_size, channel, 1, width]`。然后经过变换，变成`[batch_size, width, n_feature]`。这样就变成时序的数据了（人读文字时，也是从左往右看，有顺序的），`width`就相当于`seq_len`。再通俗地说就是，卷积网络将图片切成`width`份，用`n_feature`维的向量去表示图片对应的区域。
2. `LSTM`。处理时序数据的经典网络。数据的`shape`为`[batch_size, seq_len(width), hidden_size]`。
3. 全连接层。将`hidden_size`映射到`num_classes`。网络的输出的结果是对应字符的概率。

## CTC Loss

网络输出的`seq_len`是固定的，但是识别的文字的长度却是不定的。卷积网络将图片切成`seq_len`份，可能1个字符对应其中1份，也可能1个字符对应其中多份。该如何计算`Loss`呢？采用常规`CrossEntropyLoss`，需要先进行对齐才能计算。进行对齐就需要在训练之前的数据标注阶段在训练集图片中标记出每个字符的真实文本和在图片中的位置，工作量非常大。所以需要`CTCLoss`。

`CTCLoss`，简单来说就是，将连续的相同字符合并，`blank`不计算`Loss`。以识别`2 211`为例子，输出的正确的结果可能是`[2 2 blank 2 2 1 blank 1]`。如果输出的是`[2 2 blank 2 2 1 1 blank]`，因为会将连续的相同字符合并，所以相当于识别成了`221`。所以训练出来的网络相同的字符之间，一定会有一个`blank`（这是之前比较困扰我的一个点）。

因为`label`的长度是不定的，所以无法直接使用`DataLoader`进行加载。需要根据`CTCLoss`对数据`shape`的要求，自己实现`DataLoader`。

`CTCLoss`对数据`shape`的要求：

```python
# Target are to be un-padded
T = 50      # Input sequence length
C = 20      # Number of classes (including blank)
N = 16      # Batch size

# Initialize random batch of input vectors, for *size = (T,N,C)
input_ = torch.randn(T, N, C).log_softmax(2).detach().requires_grad_()
input_lengths = torch.full(size=(N,), fill_value=T, dtype=torch.long)

# Initialize random batch of targets (0 = blank, 1:C = classes)
target_lengths = torch.randint(low=1, high=T, size=(N,), dtype=torch.long)
target = torch.randint(low=1, high=C, size=(sum(target_lengths),), dtype=torch.long)

ctc_loss = nn.CTCLoss()
loss = ctc_loss(input_, target, input_lengths, target_lengths)
loss.backward()
```

## Talk is cheap. Show me the code.

* **Model**

  ```python
  from torch import nn
  import torch.nn.functional as functional
  
  
  class GatedRecurrentConvolutionLayer(nn.Module):
      def __init__(self, input_channel, output_channel, num_iteration, kernel_size, pad):
          super(GatedRecurrentConvolutionLayer, self).__init__()
          self.wgf_u = nn.Conv2d(input_channel, output_channel, 1, 1, 0, bias=False)
          self.wgr_x = nn.Conv2d(output_channel, output_channel, 1, 1, 0, bias=False)
          self.wf_u = nn.Conv2d(input_channel, output_channel, kernel_size, 1, pad, bias=False)
          self.wr_x = nn.Conv2d(output_channel, output_channel, kernel_size, 1, pad, bias=False)
  
          self.bn_x_init = nn.BatchNorm2d(output_channel)
  
          self.num_iteration = num_iteration
          self.gated_recurrent_convolution_layer = nn.Sequential(
              *[GatedRecurrentConvolutionLayerUnit(output_channel) for _ in range(num_iteration)]
          )
  
      def forward(self, inputs):
          wgf_u = self.wgf_u(inputs)
          wf_u = self.wf_u(inputs)
          x = functional.relu(self.bn_x_init(wf_u))
  
          for i in range(self.num_iteration):
              x = self.gated_recurrent_convolution_layer[i](wgf_u, self.wgr_x(x), wf_u, self.wr_x(x))
  
          return x
  
  
  class GatedRecurrentConvolutionLayerUnit(nn.Module):
  
      def __init__(self, output_channel):
          super(GatedRecurrentConvolutionLayerUnit, self).__init__()
          self.bn_gfu = nn.BatchNorm2d(output_channel)
          self.bn_grx = nn.BatchNorm2d(output_channel)
          self.bn_fu = nn.BatchNorm2d(output_channel)
          self.bn_rx = nn.BatchNorm2d(output_channel)
          self.bn_gx = nn.BatchNorm2d(output_channel)
  
      def forward(self, wgf_u, wgr_x, wf_u, wr_x):
          g_first_term = self.bn_gfu(wgf_u)
          g_second_term = self.bn_grx(wgr_x)
          g = functional.sigmoid(g_first_term + g_second_term)
  
          x_first_term = self.bn_fu(wf_u)
          x_second_term = self.bn_gx(self.bn_rx(wr_x) * g)
          x = functional.relu(x_first_term + x_second_term)
  
          return x
  
  
  class OcrModel(nn.Module):
      def __init__(self):
          super(OcrModel, self).__init__()
          self.conv_net = nn.Sequential(
              nn.Conv2d(3, 64, 3, 1, 1), nn.ReLU(True),
              nn.MaxPool2d(2, 2),
              GatedRecurrentConvolutionLayer(64, 64, num_iteration=5, kernel_size=3, pad=1),
              nn.MaxPool2d(2, 2),
              GatedRecurrentConvolutionLayer(64, 128, num_iteration=5, kernel_size=3, pad=1),
              nn.MaxPool2d(2, (2, 1), (0, 1)),
              GatedRecurrentConvolutionLayer(128, 256, num_iteration=5, kernel_size=3, pad=1),
              nn.MaxPool2d(2, (2, 1), (0, 1)),
              nn.Conv2d(256, 512, 2, 1, 0, bias=False),
              nn.BatchNorm2d(512), nn.ReLU(True)
          )
          self.lstm = nn.LSTM(input_size=512, hidden_size=512, num_layers=2, batch_first=True, bidirectional=True)
          self.fc = nn.Sequential(
              nn.Linear(1024, 512),
              nn.ReLU(),
              nn.Linear(512, 11),
          )
  
      def forward(self, inputs):
          outputs = self.conv_net(inputs)
  
          outputs = outputs.permute(0, 3, 1, 2)
          outputs = outputs.squeeze(3)
          outputs, _ = self.lstm(outputs)
          outputs = self.fc(outputs)
  
          return outputs
  ```

* **Train**

  ```python
  from dataset import RealDataset, MyDataloader
  from model import OcrModel
  import torch
  import torch.nn as nn
  import torch.optim as optim
  
  
  if __name__ == '__main__':
      dataset = RealDataset('dataset/images')
      dataloader = MyDataloader(dataset, batch_size=32, shuffle=True)
  
      model = OcrModel()
      model.train()
  
      optimizer = optim.AdamW(model.parameters(), lr=0.001)
      criterion = nn.CTCLoss(blank=10)
  
      total_loss = 0
      log_step = 10
      batch_idx = 0
      for epoch in range(10):
          for inputs, labels, labels_length in dataloader:
              optimizer.zero_grad()
  
              pred = model(inputs)
              pred = pred.permute(1, 0, 2)
              pred = pred.log_softmax(dim=-1)
              loss = criterion(
                  pred, labels,
                  torch.full(size=(pred.size(1),), fill_value=pred.size(0), dtype=torch.long),
                  labels_length
              )
              total_loss += loss.item()
  
              loss.backward()
              optimizer.step()
  
              batch_idx += 1
              if batch_idx % log_step == 0:
                  print(f'Batch {batch_idx:5d}  Loss: {total_loss/log_step:.4f}')
                  total_loss = 0
  
                  torch.save(model.state_dict(), 'weight.pth')
  
  ```
