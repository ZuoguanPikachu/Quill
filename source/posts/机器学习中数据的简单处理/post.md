---
title: 机器学习中数据的简单处理
date: 2023-04-13 23:15:06
tags: [数据处理, Python]
categories: 编程
index_img: https://zuoguan-piclib-1257172707.cos.ap-guangzhou.myqcloud.com/assets/3.jpg
---
`Kaggle`机器学习比赛的数据集中会有一些缺失值和一些离散值，分享一下使用pandas快速处理的方法。

首先将训练集和测试集合并（在后续步骤中训练集与测试集一起算均值、方差，属于比赛中的小技巧）
```python
train = pandas.read_csv("train.csv")
test = pandas.read_csv("test.csv")
all_features = pandas.concat((train.iloc[:, 1:-1], test.iloc[:, 1:]))
```
将数值型特征重新缩放到零均值和单位方差来标准化数据，缺失值替换为0，即均值
```python
numeric_features = all_features.dtypes[all_features.dtypes != "object"].index
all_features[numeric_features] = all_features[numeric_features].apply(
    lambda x: (x - x.mean()) / x.std()
)
all_features[numeric_features] = all_features[numeric_features].fillna(0)
```
对离散数值采用one-hot编码处理
```python
all_features = pandas.get_dummies(all_features, dummy_na=True)
```
处理完后，再重新分为训练集和测试集
```python
n_train = train.shape[0]
train_features = torch.tensor(all_features[:n_train].values.astype(numpy.float32), dtype=torch.float32)
test_features = torch.tensor(all_features[n_train:].values.astype(numpy.float32), dtype=torch.float32)
```