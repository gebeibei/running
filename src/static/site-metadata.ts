interface ISiteMetadataResult {
  siteTitle: string;
  siteUrl: string;
  description: string;
  logo: string;
  navLinks: {
    name: string;
    url: string;
  }[];
}

const data: ISiteMetadataResult = {
  siteTitle: 'Running Page',
  siteUrl: 'https://gitee.com/gebeibei',
  logo: 'https://foruda.gitee.com/avatar/1676955436582473300/1195579_gebeibei_1578945812.png!avatar200',
  description: 'Personal site and blog',
  navLinks: [
    // {
    //   name: 'Blog',
    //   url: 'https://github.com/yihong0618/gitblog',
    // },
    // {
    //   name: 'About',
    //   url: 'https://github.com/yihong0618/running_page/blob/master/README-CN.md',
    // },
  ],
};

export default data;
