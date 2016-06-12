require('RBReceiveCarStatusModel,RBPasswordHandler,UserInfoObject,NSString,NSNotificationCenter');
defineClass('SampleClass', {
    receiveRemoteControlCarStatusRet_time_seriaNo_statusInfo_socketType: function(result, time, seriaNo, statusInfo, socketType) {

        //add by zhangchh 201600419 判断指令是否超过一定的时间，如果超时则抛弃指令
        if (self.isTimeoutWithTimestamp(seriaNo)) {
            //指令超时，不往下处理
            return;
        }

        if (self.lastStatuesDate() != null && self.lastStatuesDate().timeIntervalSince1970() > time.timeIntervalSince1970()) {

            RBLog("忽略应答，最后一次更新时间：%@ 应答的时间戳：%", self.lastStatuesDate(), time);
            return;
        }

        self.setLastStatuesDate(time);
        // 构造receivedResultModel
        var model = RBReceiveCarStatusModel.alloc().init();
        model.setResult(result);
        model.setTimeStamp(time);
        model.setSeriaNo(seriaNo);
        model.setSocketType(socketType);
        model.setStatusModelList(self.buildControlModelListByInfo(statusInfo));

        /** mod by laigw 20170717 增加控制密码类型查询 */
        // 车辆状态查询包括：车辆点火状态、车辆控制密码类型等
        // 如果执行单个状态查询，则不执行以下控制密码类型的覆盖操作
        if (model.statusModelList().count() == 1) {

            var statusModel = model.statusModelList[() 0];
            switch (statusModel.controlId()) {
                case ControlStatusForCarIsIgnition:
                    { // 车辆点火状态查询
                        self.callBackWithReqKind_resultModel_sn_socketType(SocketReqKindCarIgnitionStatus, model, seriaNo, socketType);
                        break;
                    }
                case ControlStatusForCarControlPasswordType:
                    { // 车辆控制密码类型

                        // 控制密码类型
                        //                model.userInfo() = [NSDictionary dictionaryWithObjectsAndKeys:[NSNumber numberWithInt:[statusModel.controlData() toInt]], "RBControlPasswordType", null];
                        model.setCtrlPwdType(statusModel.controlData().toInt());

                        self.callBackWithReqKind_resultModel_sn_socketType(SocketReqKindCarControlPasswordType, model, seriaNo, socketType);
                        break;
                    }
                    //                add by baoyin 2016-01-14
                case ControlStatusForCarMaintenanceMode:
                    { //是否支持车辆维修模式查询
                        self.callBackWithReqKind_resultModel_sn_socketType(SocketReqKindCarControlIsSupportCarMaintenanceMode, model, seriaNo, socketType);

                        break;
                    }
                default:
                    break;
            }
            return;
        }

        // 查询车辆状态时，更改默认设备密码类型
        for (var statusModel in model.statusModelList()) {

            if (statusModel.controlId() == ControlStatusForCarControlPasswordType) {
                // add by zhangchh 获取密码类型之后 设置到passwordhandler中

                // 密码类型
                var passwordType = 0;
                passwordType = statusModel.controlData().toInt();

                NSLog("状态查询后存储的密码类型是：%d", passwordType);
                if (socketType == SocketTypeOnWifi) {

                    RBPasswordHandler.defaultHandler().setPwdType_whichKind(passwordType, WhichKindOnWifi);
                } else if (socketType == SocketTypeOnCloudServer) { // 平台

                    RBPasswordHandler.defaultHandler().setPwdType_whichKind(passwordType, WhichKindOnPlantform);
                }
            } else if (statusModel.controlId() == ControlStatusForDeviceVersion) {
                // add by laigw 20151108 设备版本信息，判断是否支持一键启动/停止操作

                if (statusModel.controlData().toHexString().isEqualToString("FFFFFFFF") || statusModel.controlData().toHexString().isEqualToString("000000FF")) {
                    UserInfoObject.shareInstance().defaultDevice().setHardwareVersionNumber(0);
                    UserInfoObject.shareInstance().defaultDevice().setSoftwareVersionNumber(0);
                    UserInfoObject.shareInstance().defaultDevice().setIsSupportOneKeyStart(NO);
                } else {
                    // 硬件版本号
                    var hardwareVersionNumberData;
                    hardwareVersionNumberData = statusModel.controlData().subdataWithRange(NSMakeRange(0, 2));
                    UserInfoObject.shareInstance().defaultDevice().setHardwareVersionNumber(hardwareVersionNumberData.toInt());

                    // 软件版本号
                    NSData * softwareVersionNumberData;
                    softwareVersionNumberData = statusModel.controlData().subdataWithRange(NSMakeRange(2, 2));
                    UserInfoObject.shareInstance().defaultDevice().setSoftwareVersionNumber(softwareVersionNumberData.toInt());

                    // 判断是否支持一键启动/停止操作
                    var hardwareVersionNumber = hardwareVersionNumberData.toInt();
                    var softwareVersionNumber = softwareVersionNumberData.toInt();
                    if ((hardwareVersionNumber == 2 && softwareVersionNumber >= 25) || (hardwareVersionNumber == 3 && softwareVersionNumber >= 12) || hardwareVersionNumber > 3) {
                        UserInfoObject.shareInstance().defaultDevice().setIsSupportOneKeyStart(YES);
                    }
                }
                UserInfoObject.shareInstance().save();
            } else if (statusModel.controlId() == ControlStatusForCarMaintenanceMode) { // 车辆维修模式 add by laigw 20151119

                if (statusModel.controlData().toHexString().isEqualToString("FFFFFFFF") || statusModel.controlData().toHexString().isEqualToString("000000FF")) {
                    UserInfoObject.shareInstance().defaultDevice().setIsSupportCarMaintenanceMode(NO);
                    UserInfoObject.shareInstance().defaultDevice().setCarMaintenanceModeStatus(NO);
                } else {
                    // 判断是否支持车辆维修模式
                    if (statusModel.controlData().toInt() == 0x00) { // 维修模式关闭
                        UserInfoObject.shareInstance().defaultDevice().setIsSupportCarMaintenanceMode(YES);
                        UserInfoObject.shareInstance().defaultDevice().setCarMaintenanceModeStatus(NO);
                    } else if (statusModel.controlData().toInt() == 0x01) { // 维修模式开启
                        UserInfoObject.shareInstance().defaultDevice().setIsSupportCarMaintenanceMode(YES);
                        UserInfoObject.shareInstance().defaultDevice().setCarMaintenanceModeStatus(YES);
                    } else {
                        UserInfoObject.shareInstance().defaultDevice().setIsSupportCarMaintenanceMode(NO);
                        UserInfoObject.shareInstance().defaultDevice().setCarMaintenanceModeStatus(NO);
                    }
                }
                UserInfoObject.shareInstance().save();
            } else if (statusModel.controlId() == ControlStatusForCarBonnet) { // 汽车引擎盖状态 add by laigw 20151121

                if (statusModel.controlData().toHexString().isEqualToString("FFFFFFFF") || statusModel.controlData().toHexString().isEqualToString("000000FF")) {
                    UserInfoObject.shareInstance().defaultDevice().setIsSupportCarBonnet(NO);
                    UserInfoObject.shareInstance().defaultDevice().setCarBonnetStatus(NO);
                } else {
                    // 判断是否支持车辆维修模式
                    if (statusModel.controlData().toInt() == 0x00) { // 汽车引擎盖关闭
                        UserInfoObject.shareInstance().defaultDevice().setIsSupportCarBonnet(YES);
                        UserInfoObject.shareInstance().defaultDevice().setCarBonnetStatus(NO);
                    } else if (statusModel.controlData().toInt() == 0x01) { // 汽车引擎盖开启
                        UserInfoObject.shareInstance().defaultDevice().setIsSupportCarBonnet(YES);
                        UserInfoObject.shareInstance().defaultDevice().setCarBonnetStatus(YES);
                    } else {
                        UserInfoObject.shareInstance().defaultDevice().setIsSupportCarBonnet(NO);
                        UserInfoObject.shareInstance().defaultDevice().setCarBonnetStatus(NO);
                    }
                }
            } else if (statusModel.controlId() == ControlStatusForProgramType) { // 程序类型 add by laigw 20160122

                var programType = NSString.alloc().initWithData_encoding(statusModel.controlData(), NSUTF8StringEncoding);
                UserInfoObject.shareInstance().defaultDevice().setProgramType(programType);

                // 你的出现，让世界更加的美好！
                UserInfoObject.shareInstance().defaultDevice().setIsSupportAuthUserUpdateControlPassword(YES);

                UserInfoObject.shareInstance().defaultDevice().setIsSupportOneKeyStart(YES);
                UserInfoObject.shareInstance().save();
            } else if (statusModel.controlId() == ControlStatusForVersionNumber) { // 版本号 add by laigw 20160122

                var versionNumber = NSString.alloc().initWithData_encoding(statusModel.controlData(), NSUTF8StringEncoding);
                UserInfoObject.shareInstance().defaultDevice().setVersionNumber(versionNumber);

                // 有这两个ID值，代表是可支持授权用户修改控制密码的
                UserInfoObject.shareInstance().defaultDevice().setIsSupportAuthUserUpdateControlPassword(YES);

                UserInfoObject.shareInstance().defaultDevice().setIsSupportOneKeyStart(YES);
                UserInfoObject.shareInstance().save();
            } else if (statusModel.controlId() == ControlStatusForCarSharingStatus) { // 分享状态

                if (statusModel.controlData().toInt() == 0x01) {
                    //已分享
                    UserInfoObject.shareInstance().defaultDevice().setIsSharing(YES);
                } else {
                    //未分享
                    UserInfoObject.shareInstance().defaultDevice().setIsSharing(NO);
                }
                //此设备支持分享功能
                UserInfoObject.shareInstance().defaultDevice().setIsSupportSharing(RBSupportSharing);
                UserInfoObject.shareInstance().save();
            }
        }

        var callBackMission = self.callBackWithReqKind_resultModel_sn_socketType(SocketReqKindCarStatus, model, seriaNo, socketType);

        model.setMission(callBackMission);

        // 通知上报消息 del by zhangchh 2015-09-06 更新状态通知放到conditionviewcontroller中发起
        //[[NSNotificationCenter defaultCenter] postNotificationName:kRBCommDataReceiveRemoteControlCarStatusNotification object:model];

        // 兼容旧设备：如果没有返回车辆行车数据，则需要通知进行HTTP请求
        if (model.statusModelList().count() == 8) {
            NSNotificationCenter.defaultCenter().postNotificationName_object(RBCommDataReceiveRemoteControlCarTravelingDataQueryNotification, model);
        }
    },
});