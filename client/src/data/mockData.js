/**
 * Realistic academic research mock dataset for ResearchForge Demo MVP
 */
export const initialPapers = [
  {
    id: "rf-paper-001",
    title: "Attention Is All You Need",
    authors: [
      "Ashish Vaswani",
      "Noam Shazeer",
      "Niki Parmar",
      "Jakob Uszkoreit",
      "Llion Jones",
      "Aidan N. Gomez",
      "Łukasz Kaiser",
      "Illia Polosukhin"
    ],
    abstract: "The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and a decoder. The best performing models also connect the encoder and decoder through an attention mechanism. We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely. Experiments on two machine translation tasks show these models to be superior in quality while being more parallelizable and requiring significantly less time to train.",
    year: 2017,
    venue: "Advances in Neural Information Processing Systems (NeurIPS 30)",
    doi: "10.48550/arXiv.1706.03762",
    url: "https://arxiv.org/abs/1706.03762",
    tags: ["Transformer", "Deep Learning", "NLP", "Attention"],
    collections: ["col-ml-core"],
    addedAt: "2026-10-15T10:30:00Z"
  },
  {
    id: "rf-paper-002",
    title: "Deep Residual Learning for Image Recognition",
    authors: [
      "Kaiming He",
      "Xiangyu Zhang",
      "Shaoqing Ren",
      "Jian Sun"
    ],
    abstract: "Deeper neural networks are more difficult to train. We present a residual learning framework to ease the training of networks that are substantially deeper than those previously used. We explicitly reformulate the layers as learning residual functions with reference to the layer inputs, instead of learning unreferenced functions. We provide comprehensive empirical evidence showing that these residual networks are easier to optimize, and can gain accuracy from considerably increased depth.",
    year: 2016,
    venue: "IEEE Conference on Computer Vision and Pattern Recognition (CVPR)",
    doi: "10.1109/CVPR.2016.90",
    url: "https://doi.org/10.1109/CVPR.2016.90",
    tags: ["Computer Vision", "ResNet", "Deep Learning", "Optimization"],
    collections: ["col-ml-core"],
    addedAt: "2026-10-18T14:20:00Z"
  },
  {
    id: "rf-paper-003",
    title: "Generative Adversarial Nets",
    authors: [
      "Ian Goodfellow",
      "Jean Pouget-Abadie",
      "Mehdi Mirza",
      "Bing Xu",
      "David Warde-Farley",
      "Sherjil Ozair",
      "Aaron Courville",
      "Yoshua Bengio"
    ],
    abstract: "We propose a new framework for estimating generative models via an adversarial process, in which we simultaneously train two models: a generative model G that captures the data distribution, and a discriminative model D that estimates the probability that a sample came from the training data rather than G. The training procedure for G is to maximize the probability of D making a mistake. This framework corresponds to a minimax two-player game.",
    year: 2014,
    venue: "Advances in Neural Information Processing Systems (NeurIPS 27)",
    doi: "10.1145/3422622",
    url: "https://arxiv.org/abs/1406.2661",
    tags: ["Generative Models", "GANs", "Machine Learning", "Minimax"],
    collections: ["col-generative-ai"],
    addedAt: "2026-11-01T09:15:00Z"
  },
  {
    id: "rf-paper-004",
    title: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks",
    authors: [
      "Patrick Lewis",
      "Ethan Perez",
      "Aleksandra Piktus",
      "Fabio Petroni",
      "Vladimir Karpukhin",
      "Naman Goyal",
      "Heinrich Küttler",
      "Mike Lewis",
      "Wen-tau Yih",
      "Tim Rocktäschel",
      "Sebastian Riedel",
      "Douwe Kiela"
    ],
    abstract: "Large pre-trained language models have been shown to store factual knowledge in their parameters, and achieve state-of-the-art results when fine-tuned on downstream NLP tasks. However, their ability to access and precisely manipulate knowledge is still limited. We explore a general-purpose fine-tuning recipe for retrieval-augmented generation (RAG) — models which combine pre-trained parametric and non-parametric memory for language generation.",
    year: 2020,
    venue: "Advances in Neural Information Processing Systems (NeurIPS 33)",
    doi: "10.48550/arXiv.2005.11401",
    url: "https://arxiv.org/abs/2005.11401",
    tags: ["RAG", "Information Retrieval", "NLP", "LLM"],
    collections: ["col-rag-systems"],
    addedAt: "2026-11-04T16:45:00Z"
  },
  {
    id: "rf-paper-005",
    title: "Graph Attention Networks",
    authors: [
      "Petar Veličković",
      "Guillem Cucurull",
      "Arantxa Casanova",
      "Adriana Romero",
      "Pietro Liò",
      "Yoshua Bengio"
    ],
    abstract: "We present graph attention networks (GATs), novel neural network architectures that operate on graph-structured data, leveraging masked self-attentional layers to address the shortcomings of prior methods based on graph convolutions or their approximations. By stacking layers in which nodes are able to attend over their neighborhoods' features, we enable (implicitly) specifying different weights to different nodes in a neighborhood.",
    year: 2018,
    venue: "International Conference on Learning Representations (ICLR 2018)",
    doi: "10.48550/arXiv.1710.10903",
    url: "https://arxiv.org/abs/1710.10903",
    tags: ["Graph Neural Networks", "Attention", "GAT", "Representation Learning"],
    collections: ["col-ml-core"],
    addedAt: "2026-11-06T11:00:00Z"
  }
];

export const initialCollections = [
  {
    id: "col-ml-core",
    name: "Foundational Machine Learning",
    description: "Seminal papers on deep learning architectures, residual representations, and attention mechanisms.",
    createdAt: "2026-10-15T09:00:00Z",
    color: "amber"
  },
  {
    id: "col-generative-ai",
    name: "Generative Models & Synthesis",
    description: "Exploration of adversarial networks, likelihood-based synthesis, and generative frameworks.",
    createdAt: "2026-10-20T12:00:00Z",
    color: "emerald"
  },
  {
    id: "col-rag-systems",
    name: "Knowledge Augmentation & RAG",
    description: "Retrieval-augmented architectures connecting non-parametric external indexes to parametric models.",
    createdAt: "2026-11-02T14:30:00Z",
    color: "blue"
  }
];

export const mockDoiLookupDatabase = {
  "10.1038/nature14539": {
    title: "Deep Learning",
    authors: ["Yann LeCun", "Yoshua Bengio", "Geoffrey Hinton"],
    abstract: "Deep learning allows computational models that are composed of multiple processing layers to learn representations of data with multiple levels of abstraction. These methods have dramatically improved the state-of-the-art in speech recognition, visual object recognition, object detection and many other domains.",
    year: 2015,
    venue: "Nature 521, 436–444",
    doi: "10.1038/nature14539",
    url: "https://doi.org/10.1038/nature14539",
    tags: ["Deep Learning", "Review", "Neural Networks"]
  },
  "10.1145/3065386": {
    title: "ImageNet Classification with Deep Convolutional Neural Networks",
    authors: ["Alex Krizhevsky", "Ilya Sutskever", "Geoffrey E. Hinton"],
    abstract: "We trained a large, deep convolutional neural network to classify the 1.2 million high-resolution images in the ImageNet LSVRC-2010 contest into the 1000 different classes. On the test data, we achieved top-1 and top-5 error rates of 37.5% and 17.0% which is considerably better than the previous state-of-the-art.",
    year: 2017,
    venue: "Communications of the ACM",
    doi: "10.1145/3065386",
    url: "https://doi.org/10.1145/3065386",
    tags: ["AlexNet", "CNN", "ImageNet", "Computer Vision"]
  }
};

