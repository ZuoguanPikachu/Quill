---
title: 部落冲突辅助
date: 2024-02-03 10:49:32
tags: [脚本, Python]
categories: 编程
index_img: https://zuoguan-piclib-1257172707.cos.ap-guangzhou.myqcloud.com/assets/6.jpg
---
最近在重新开始玩部落冲突这款游戏。在高中时期，我非常喜欢这款游戏。当时我就想写一个脚本帮我自动搜鱼，搜到鱼后提示我，我就在一旁写作业。或者甚至能自动打鱼。当时技术有限，做了一个凑活能用的。现在想再次尝试实现一下。

## Airtest
在高中时期遇到的第一个难题就是：捏合缩放，用于把地图缩小。当时是使用ADB控制手机，研究了很久发现无法实现，最后只能在每次脚本运行前，手动将地图缩小。

现在了解到`Airtest`可以轻松地做到。此外，`Airtest`还提供了其他丰富的API，使得连接设备、截图等操作能轻松实现。

## 数字识别
高中时期遇到的第二个难题是：数字识别。事实上，当时我已经实现了将图片二值化，然后裁剪出每一个数字。只要将裁剪出的数字和模板计算相似度，就能够完成数字识别的任务了。不记得当时遇到了什么阻碍，最后是调用百度文字识别OCR的API完成的。

现在学习了深度学习，对于这样的图像分类任务，简直是小菜一碟。

### 二值化
```python
import cv2
import numpy

# 图片裁剪
ResourceArea = (126, 100, 286, 165)

im = cv2.imread("snapshot.png")
im = im[ResourceArea[1]:ResourceArea[3], ResourceArea[0]:ResourceArea[2]]

# 二值化
im = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
_, im = cv2.threshold(im, 195, 255, cv2.THRESH_BINARY)

kernel = numpy.ones((3, 3), numpy.uint8)
im = cv2.erode(im, kernel) # 腐蚀
im = cv2.dilate(im, kernel) # 膨胀 
```
一般情况，二值化先用`cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)`将图片转为灰度图像，再用`cv2.threshold(im, threshould, 255, cv2.THRESH_BINARY)`就完成了二值化。

但是在本例中，将阈值设得比较低，数字以外得区域还会有白点；将阈值设得比较高，数字变得非常残缺。所以设置了一个居中的阈值，然后进行腐蚀后膨胀的操作，消除小的白点。

结果如下：

![二值化结果](./assets/二值化结果.png)

### 裁剪单个数字
```python
gold_im = im[0: im.shape[0]//2, 0: im.shape[1]] # 取第一行（金币）

contours, _ = cv2.findContours(im, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
contours = sorted(contours, key=lambda item: cv2.boundingRect(item)[0]) # 按从左到右的顺序

for contour in contours:
    x, y, w, h = cv2.boundingRect(contour)
    single_num = gold_im[y:y + h, x:x + w]
    single_num = cv2.resize(single_num, (16, 16))
```
高中时，是自己实现了这一算法的。现在，通过ChatGPT，了解到了cv2.findContours这一函数，是用于在图像中查找轮廓的函数。

然后就是不断搜鱼、截图，制作用于训练神经网络的数据集，每个数字收集20张左右已经足够了。

![数字](./assets/数字.jpg)

（因为resize操作，数字1变形比较严重，不过没关系）

### 神经网络
```python
import torch.nn as nn
import torch


class Net(nn.Module):
    def __init__(self):
        super(Net, self).__init__()
        self.features = nn.Sequential(
            nn.Conv2d(3, 32, kernel_size=3, padding=1),
            nn.ReLU(inplace=True),
            nn.Conv2d(32, 32, kernel_size=3, padding=1),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(kernel_size=2, stride=2),

            nn.Conv2d(32, 64, kernel_size=3, padding=1),
            nn.ReLU(inplace=True),
            nn.Conv2d(64, 64, kernel_size=3, padding=1),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(kernel_size=2, stride=2),

            nn.Conv2d(64, 128, kernel_size=3, padding=1),
            nn.ReLU(inplace=True),
            nn.Conv2d(128, 128, kernel_size=3, padding=1),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(kernel_size=2, stride=2),
        )

        self.classifier = nn.Sequential(
            nn.Linear(512, 128),
            nn.ReLU(inplace=True),

            nn.Linear(128, 32),
            nn.ReLU(inplace=True),

            nn.Linear(32, 10),
        )

    def forward(self, inputs):
        outputs = self.features(inputs)
        outputs = torch.flatten(outputs, 1)
        outputs = self.classifier(outputs)

        return outputs
```
因为任务比较简单，这种级别的神经网络已经能完美地完成任务了。

### 训练
```python
from torchvision.datasets import ImageFolder
from torchvision import transforms
from torch.utils.data import DataLoader
import torch
import torch.nn as nn
import torch.optim as optim


dataset = ImageFolder('dataset', transforms.ToTensor())
data_loader = DataLoader(dataset=dataset, batch_size=16, shuffle=True)

model = Net()
optimizer = optim.AdamW(model.parameters(), lr=0.001)
criterion = nn.CrossEntropyLoss()

num_epochs = 25
for epoch in range(num_epochs):
    model.train()
    total_loss = 0
    for inputs, labels in data_loader:
        optimizer.zero_grad()

        outputs = model(inputs)
        loss = criterion(outputs, labels)
        total_loss += loss.item()
        loss.backward()
        optimizer.step()

    print(f'Epoch [{epoch+1:02d}/{num_epochs}], Loss: {total_loss/len(data_loader):.8f}')

torch.save(model.state_dict(), 'weight.pth')
```
小神经网络+小数据集，在我的小破笔记本上1分钟不到就训练好了。

### 推理
```python
model = Net()
model.load_state_dict(torch.load("weight.pth"))

contours, _ = cv2.findContours(gold_im, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
contours = sorted(contours, key=lambda item: cv2.boundingRect(item)[0])

transform = transforms.Compose([
    transforms.ToPILImage(),
    transforms.ToTensor()
])

nums = []
for contour in contours:
    x, y, w, h = cv2.boundingRect(contour)
    num = gold_im[y:y + h, x:x + w]
    num = cv2.resize(num, (16, 16))
    num = cv2.cvtColor(num, cv2.COLOR_GRAY2RGB)
    num = transform(num)
    texts.append(num)

nums = torch.stack(nums)
res = model(nums)
res = numpy.argmax(res.detach().numpy(), 1)
res = numpy.sum(res*10**numpy.arange(len(res)-1, -1, -1))
```
搜了几条鱼试验了一下，目前准确率100%，从截完图到识别出结果，耗时在50ms以内，后期资源数上升，再加上黑油，应该也能在200ms内完成推理。

## 活死鱼判断
这个是一直困扰着我的难题。开始做这个项目，我就一直在想该怎样完成这一任务。

* CNN Is All You Need?

    最初的想法是直接用卷积神经网络来完成，收集上千个样本，然后直接训练。但是仔细思考，人是怎么判断活死鱼的呢？我是通过墓碑数和采集器是否是满的来判断，CNN能捕捉到这些小细节吗？我对此抱有怀疑。

    接着，我就想使用多个分类器，就是CNN提取完特征后，分类器1判断墓碑数是多是少，分类器2判断采集器是否是满的，分类器3才判断是死鱼还是活鱼，前两个分类器是帮助模型收敛和防止过拟合的。

    但是考虑到要标注上千张图片，还是作罢了。

* You Only Look Once

    又想到了用目标检测算法，检测图片中的奖牌、墓碑、满的采集器。现在训练Yolov8近乎是傻瓜式的。以及之前训练过一个用于微信跳一跳的Yolov5模型，当时只用了60张图片就训练出了一个很不错的模型，而且有相当强的泛化能力。所以我对这一方案进行了尝试，且非常有信息。然而，标注了30张图像，训练的结果非常糟糕。

* 传统CV

    无奈，只能使用传统的CV了。判断的规则是，如果是灰牌且有5个以上的墓碑则是死鱼，或者有10个以上的墓碑也是死鱼。

关键的代码是
```python
score = cv2.matchTemplate(origin, template, cv2.TM_CCOEFF_NORMED)
```

每个墓碑会有几个像素的差异，而墓碑又非常小，导致几个像素的差异影响非常大，所以是通过计数得分＞0.75的个数，来近似墓碑的个数。

## 模拟下兵

入坑部落冲突的一个原因是，这个游戏居然可以滑动下兵！所以大家口中的“一字划”，我是真的“一字划”的。所以我希望能模拟出这种下兵方式。

仔细阅读`Airtest`的API文档和源码后，了解到了`airtest.core.android.touch_methods.base_touch`中有`DownEvent`、`UpEvent`、`MoveEvent`、`SleepEvent`这四个基本事件类，`contact`参数用来实现多触点，`contact=0`为触点1，`contact=1`为触点2，以此类推。这一`module`中，还有`BaseTouch`这一基类，定义了`swipe`、`pinch`、`touch`等手势，这些手势是由`DownEvent`、`UpEvent`、`MoveEvent`、`SleepEvent`组合成的。

在`airtest.core.android.touch_methods.minitouch`和`airtest.core.android.touch_methods.maxtouch`这两个`module`中，都基于`BaseTouch`实现了`MaxTouch`和`MiniTouch`。我个人的理解是，它们使用不同的方法去执行`DownEvent`、`UpEvent`、`MoveEvent`、`SleepEvent`，而`BaseTouch`是没有实现执行的方法的。

于是我继承了`MaxTouch`，去实现我的滑动下兵，简单来说就是一个`DownEvent`，加上数个`SleepEvent`、`MoveEvent`，最后来一个`UpEvent`。虽然尽力地去模仿人类真实下兵的样子了，但依旧有很大差别。

此外，我还重写了`swipe`、`pinch`、`touch`这些手势，加上了一些随机的偏移。（主要是害怕被封号，不过也不知道这样有没有用）