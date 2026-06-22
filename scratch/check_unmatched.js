const { Stock } = require('../models');

const userSymbols = ["ABB","ABBPOW","ADAENT","ADAGRE","ADAPOR","ADATRA","ADICAP","ALKLAB","AMBCE","AMBEN","ANGBRO","APLAPO","APOHOS","ASHLEY","ASIPAI","ASTPOL","AURPHA","AUSMA","AVESUP","AXIBAN","BAAUTO","BAFINS",
    "BAJFI","BAJHOL","BANBAN","BANBAR","BANIND","BHAAIR","BHADYN","BHAELE","BHAFOR","BHAINF","BHAPET","BHEL","BIOCON","BLUSTA","BOSLIM","BRIIND","BSE","CADHEA","CANBAN","CDSL","CHOINV","CIPLA","CNXBAN",
    "COALIN","COLPAL","COMAGE","CONCOR","CROGR","CROGRE","CUMIND","DABIND","DELLIM","DIVLAB","DIXTEC","DLFLIM","DRREDD","EICMOT","EXIIND","FEDBAN","FORHEA","FSNECO","GAIL","GLEPHA","GMRINF","GODCON",
    "GODPRO","GRASIM","HAVIND","HCLTEC","HDFAMC","HDFBAN","HDFSTA","HERHON","HINAER","HINDAL","HINLEV","HINPET","HINZIN","HUDCO","ICIBAN","ICILOM","ICIPRU","IDECEL","IDFBAN","IIFWEA","INDBA","INDEN",
    "INDHO","INDHOT","INDIBA","INDOIL","INDR","INDREN","INFEDG","INFTEC","INOWIN","INTAVI","ITC","JINSP","JIOFIN","JSWENE","JSWSTE","JUBFOO","KALJEW","KAYTEC","KEIIND","KFITEC","KOTMAH","KPITE","LARTOU",
    "LAULAB","LIC","LICHF","LTFINA","LTINFO","LUPIN","MACDEV","MAHMAH","MANAFI","MAPHA","MARLIM","MARUTI","MAXFIN","MAXHEA","MAZDOC","MCX","MININD","MOTSUM","MPHLIM","MUTFIN","NATALU","NATMIN","NBCC",
    "NESIND","NHPC","NIFFIN","NIFNEX","NIFSEL","NIFTY","NIITEC","NTPC","NUVWEA","OBEREA","ODICEM","OILIND","ONE97","ONGC","ORAFIN","PAGIND","PBFINT","PERSYS","PETLNG","PGELEC","PHOMIL","PIDIND","PIIND",
    "PIRPHA","PNBHOU","POLI","POWFIN","POWGRI","PREENR","PREEST","PUNBAN","RAIVIK","RBLBAN","RELIND","RUCSOY","RURELE","SAIL","SBICAR","SBILIF","SHRCEM","SHRTRA","SIEMEN","SOLIN","SONBLW","SRF","STABAN",
    "SUNPHA","SUPIND","SUZENE","SWILIM","SYNINT","TATELX","TATGLO","TATMOT","TATPOW","TATSTE","TATTEC","TCS","TECMAH","TITIND","TORPHA","TORPOW","TRENT","TUBIN","TVSMOT","ULTCEM","UNIBAN","UNIP",
    "UNISPI","VARBEV","VEDLIM","VOLTAS","WAAENE","WIPRO","YESBAN","ZOMLIM"];

async function check() {
    try {
        const dbStocks = await Stock.findAll({ attributes: ['userCode'] });
        const dbUserCodes = new Set(dbStocks.map(s => s.userCode.toUpperCase()));
        
        const unmatched = userSymbols.filter(s => !dbUserCodes.has(s.toUpperCase()));
        
        console.log(`Total User Symbols: ${userSymbols.length}`);
        console.log(`Matched in DB: ${dbUserCodes.size}`);
        console.log(`Unmatched Symbols:`, unmatched);
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
